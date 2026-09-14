import type { ConversationState, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import {
  chat,
  estimateCostUsd,
  recordUsage,
  resolveModelConfig,
  type ChatMessage,
  type ChatResult,
  type ResolvedModelConfig,
  type ToolDef,
  type Usage,
} from "./client";
import { buildMessages, replyDelayMs, splitReply } from "./prompt";
import { executeTool, getToolDefs, type ToolContext } from "./tools";

/**
 * The agent loop: one inbound message in, the customer's replies out.
 *
 * This runs in the worker, never in a webhook request (CLAUDE.md §3) — a model
 * call takes seconds, and a provider that times out retries the webhook, which
 * would run the whole thing twice and bill us twice.
 */

export interface ExecutedToolCall {
  id: string;
  name: string;
  args: unknown;
  result: string;
}

const EMPTY_USAGE: Usage = { promptTokens: 0, cachedTokens: 0, outputTokens: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// The multi-step loop, shared by the live turn and the try-it-out sandbox.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolLoopOptions {
  cfg: ResolvedModelConfig;
  messages: ChatMessage[];
  ctx: ToolContext;
  tools?: ToolDef[];
  model?: string;
  maxSteps?: number;
  signal?: AbortSignal;
  /**
   * Checked BEFORE every model call, with what this turn has spent so far.
   * Return a reason to stop; return null to continue. This is where spend caps
   * live — after the call is too late, we have already paid.
   */
  beforeCall?: (spentThisTurn: number) => Promise<string | null> | string | null;
  /** What a finished call cost, and where it gets recorded. Defaults to a non-persisting estimate. */
  onResult?: (result: ChatResult) => Promise<number>;
}

export interface ToolLoopResult {
  text: string | null;
  toolCalls: ExecutedToolCall[];
  steps: number;
  usage: Usage;
  costUsd: number;
  model: string | null;
  stopped: "complete" | "max_steps" | "blocked";
  reason?: string;
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return raw; // keep what the model actually sent — it is the evidence
  }
}

export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  // Copied: the caller's array is theirs, and the loop appends to it heavily.
  const messages: ChatMessage[] = [...opts.messages];
  const maxSteps = opts.maxSteps ?? env.MAX_AGENT_STEPS;
  const executed: ExecutedToolCall[] = [];
  const usage: Usage = { ...EMPTY_USAGE };

  let costUsd = 0;
  let steps = 0;
  let model: string | null = null;
  let text: string | null = null;
  let lastContent: string | null = null;
  let stopped: ToolLoopResult["stopped"] = "max_steps";

  while (steps < maxSteps) {
    const block = await opts.beforeCall?.(costUsd);
    if (block) return { text, toolCalls: executed, steps, usage, costUsd, model, stopped: "blocked", reason: block };

    const result = await chat(opts.cfg, {
      messages,
      tools: opts.tools,
      model: opts.model,
      signal: opts.signal,
    });
    steps++;
    model = result.model;
    usage.promptTokens += result.usage.promptTokens;
    usage.cachedTokens += result.usage.cachedTokens;
    usage.outputTokens += result.usage.outputTokens;
    costUsd += opts.onResult
      ? await opts.onResult(result)
      : estimateCostUsd(result.model, result.usage);

    const content = result.content?.trim() || null;
    if (content) lastContent = content;

    if (!result.toolCalls.length) {
      text = content;
      stopped = "complete";
      break;
    }

    // The prompt tells the model to call a function AND write a reply in the
    // same turn, so `content` here is often real customer-facing text. It is
    // held back rather than sent: the model gets to see the tool results and
    // usually rewrites it. Only if we run out of steps does it get used.
    messages.push({ role: "assistant", content: result.content, tool_calls: result.toolCalls });

    for (const call of result.toolCalls) {
      let output: string;
      try {
        output = await executeTool(call.function.name, call.function.arguments, opts.ctx);
      } catch (err) {
        // A broken tool must not silence the customer. Hand the model the real
        // message so it can apologise or escalate instead of the turn dying.
        output = `Error: ${call.function.name} failed — ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[agent] tool ${call.function.name} threw:`, err);
      }
      executed.push({
        id: call.id,
        name: call.function.name,
        args: parseArgs(call.function.arguments),
        result: output,
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: output,
      });
    }
  }

  if (stopped === "max_steps" && text === null) text = lastContent;
  return { text, toolCalls: executed, steps, usage, costUsd, model, stopped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge retrieval
// ─────────────────────────────────────────────────────────────────────────────

export interface RetrievedFaq {
  id: string;
  question: string;
  answer: string;
}

function toFaqRows(value: unknown): RetrievedFaq[] {
  if (!Array.isArray(value)) return [];
  const rows: RetrievedFaq[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.question === "string" && typeof r.answer === "string") {
      rows.push({
        id: typeof r.id === "string" ? r.id : "",
        question: r.question,
        answer: r.answer,
      });
    }
  }
  return rows;
}

async function attempt(fn: (...a: unknown[]) => unknown, args: unknown[]): Promise<unknown> {
  try {
    return await fn(...args);
  } catch {
    return null;
  }
}

/**
 * Top FAQs for this turn.
 *
 * lib/knowledge/retrieve.ts (full-text ranking) landed on another track while
 * this was being written, so it is still reached lazily and behind a try/catch:
 * a knowledge module that is mid-edit, or throws on a query, must not take a
 * customer's reply down with it. The fallback is useCount ordering, which still
 * puts the answers that earn their place at the top.
 *
 * TODO: swap for a static import — the lazy form hides a typo until runtime.
 */
async function retrieveFaqs(
  organizationId: string,
  query: string,
  take: number,
): Promise<RetrievedFaq[]> {
  try {
    const mod = (await import("../knowledge/retrieve")) as Record<string, unknown>;
    const fn = mod.retrieveFaqs;
    if (typeof fn === "function") {
      const rows = toFaqRows(await attempt(fn as (...a: unknown[]) => unknown, [organizationId, query, take]));
      // No rows is a legitimate answer — nothing in the knowledge base matched —
      // but the model does better with the house's best answers than with none.
      if (rows.length) return rows;
    }
  } catch {
    // Module missing or broken; the fallback below is always serviceable.
  }

  return prisma.faq.findMany({
    where: { organizationId },
    // Hand-written FAQs outrank generated ones (CLAUDE.md §7). The id tiebreak
    // keeps the order stable as useCount moves, so the cached prompt prefix
    // does not silently stop matching mid-conversation.
    orderBy: [{ isManual: "desc" }, { useCount: "desc" }, { id: "asc" }],
    take,
    select: { id: true, question: true, answer: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Spend caps
// ─────────────────────────────────────────────────────────────────────────────

/** Spend recorded for this org since midnight UTC. */
async function orgSpendToday(organizationId: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0); // UTC, not the org's timezone — a cap, not a bill
  const agg = await prisma.usageRecord.aggregate({
    where: { organizationId, createdAt: { gte: since } },
    _sum: { costUsd: true },
  });
  return Number(agg._sum.costUsd ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// runAgentTurn
// ─────────────────────────────────────────────────────────────────────────────

export interface RunAgentTurnArgs {
  conversationId: string;
  incomingText: string;
  /**
   * Pass it when the caller knows it. The conversation row carries the scope
   * either way, but supplying it means an id from another tenant resolves to
   * nothing instead of to somebody else's conversation.
   */
  organizationId?: string;
  signal?: AbortSignal;
}

export type AgentTurnStatus =
  | "replied" // bubbles persisted, ready to send
  | "paused" // a human owns it, or it is closed — the AI stays out
  | "excluded" // this contact is opted out of the bot
  | "unavailable" // no active agent or the channel is paused
  | "capped" // spend cap hit; escalated instead of going quiet
  | "silent"; // the model produced no text — a bug, surfaced not swallowed

export interface AgentTurnResult {
  status: AgentTurnStatus;
  reason?: string;
  bubbles: string[];
  messageIds: string[];
  toolCalls: ExecutedToolCall[];
  steps: number;
  usage: Usage;
  costUsd: number;
  model: string | null;
  /** How long the caller should wait before sending the first bubble. */
  delayMs: number;
  conversationState: ConversationState;
}

function stop(
  status: AgentTurnStatus,
  reason: string,
  conversationState: ConversationState,
): AgentTurnResult {
  return {
    status,
    reason,
    bubbles: [],
    messageIds: [],
    toolCalls: [],
    steps: 0,
    usage: { ...EMPTY_USAGE },
    costUsd: 0,
    model: null,
    delayMs: 0,
    conversationState,
  };
}

export async function runAgentTurn(args: RunAgentTurnArgs): Promise<AgentTurnResult> {
  const convo = await prisma.conversation.findFirst({
    where: {
      id: args.conversationId,
      ...(args.organizationId ? { organizationId: args.organizationId } : {}),
    },
    include: { contact: true, agent: true, channel: true },
  });
  if (!convo) {
    throw new Error(
      `Conversation ${args.conversationId} not found${args.organizationId ? ` in org ${args.organizationId}` : ""}.`,
    );
  }

  const organizationId = convo.organizationId;

  // ── The gates that keep the AI out of a human's conversation ──────────────
  // Checked before anything costs money, and before any reply can be composed.
  if (convo.state === "HUMAN_ACTIVE") {
    return stop("paused", "A colleague is handling this conversation.", convo.state);
  }
  if (convo.state === "CLOSED") {
    return stop("paused", "This conversation is closed; reopen it to let the AI reply.", convo.state);
  }
  if (convo.contact.botExcluded) {
    return stop("excluded", "This contact is excluded from the bot.", convo.state);
  }
  if (!convo.agent) {
    return stop("unavailable", "No agent is assigned to this conversation.", convo.state);
  }
  if (!convo.agent.isActive) {
    return stop("unavailable", `Agent "${convo.agent.name}" is switched off.`, convo.state);
  }
  if (convo.channel.status === "PAUSED") {
    return stop("unavailable", `Channel "${convo.channel.displayName}" is paused.`, convo.state);
  }

  const agent = convo.agent;

  // ── History ───────────────────────────────────────────────────────────────
  const recent = await prisma.message.findMany({
    where: { conversationId: convo.id, organizationId },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { direction: true, body: true, createdAt: true },
  });
  const history = recent.reverse();

  // The webhook persists the inbound message before enqueuing, so the message
  // we are answering is usually already the last row. buildMessages appends
  // `incoming` itself — without this it would appear twice and the model would
  // read it as the customer repeating themselves.
  const last = history[history.length - 1];
  if (last && last.direction === "INBOUND" && last.body.trim() === args.incomingText.trim()) {
    history.pop();
  }

  const faqs = await retrieveFaqs(organizationId, args.incomingText, 8);

  const cfg = await resolveModelConfig(organizationId);
  const messages = buildMessages({
    agent,
    contact: convo.contact,
    conversation: { summary: convo.summary },
    faqs: faqs.map((f) => ({ question: f.question, answer: f.answer })),
    history,
    incoming: args.incomingText,
  });

  const ctx: ToolContext = {
    organizationId,
    conversationId: convo.id,
    contactId: convo.contactId,
  };

  // ── Spend caps ────────────────────────────────────────────────────────────
  // The org row's own cap and the platform ceiling both apply; the tighter one
  // wins, because a tenant lowering their cap must actually lower it.
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { dailyCostCapUsd: true },
  });
  const effectiveDailyCap = Math.min(
    Number(org.dailyCostCapUsd),
    env.MAX_COST_USD_PER_ORG_PER_DAY,
  );
  const conversationSpent = Number(convo.totalCostUsd);
  // Read once and track locally: an aggregate per step would be a query per
  // model call for a number that only this turn is moving.
  const spentTodayBefore = await orgSpendToday(organizationId);

  const beforeCall = (spentThisTurn: number): string | null => {
    if (conversationSpent + spentThisTurn >= env.MAX_COST_USD_PER_CONVERSATION) {
      return `Conversation spend cap reached ($${env.MAX_COST_USD_PER_CONVERSATION}).`;
    }
    if (spentTodayBefore + spentThisTurn >= effectiveDailyCap) {
      return `Daily spend cap for this account reached ($${effectiveDailyCap}).`;
    }
    return null;
  };

  const loop = await runToolLoop({
    cfg,
    messages,
    ctx,
    tools: getToolDefs(),
    model: agent.modelOverride ?? undefined,
    signal: args.signal,
    beforeCall,
    onResult: (result) =>
      recordUsage({ organizationId, conversationId: convo.id, kind: "chat", result }),
  });

  // Whatever happened, the tokens were spent — record them before deciding what
  // to do about it.
  await settleSpend(convo.id, loop.costUsd, faqs, organizationId);

  // ── Capped ────────────────────────────────────────────────────────────────
  if (loop.stopped === "blocked") {
    // Going quiet on a customer is not an option a cap gets to make. Hand over
    // to a human, so the conversation shows up in the inbox as needing a person
    // rather than appearing to be handled.
    const escalation = await executeTool(
      "alertHuman",
      { reason: `AI stopped: ${loop.reason}`, urgency: "high" },
      ctx,
    );
    return {
      status: "capped",
      reason: loop.reason,
      bubbles: [],
      messageIds: [],
      toolCalls: [...loop.toolCalls, { id: "cap", name: "alertHuman", args: { reason: loop.reason }, result: escalation }],
      steps: loop.steps,
      usage: loop.usage,
      costUsd: loop.costUsd,
      model: loop.model,
      delayMs: 0,
      conversationState: "HUMAN_ACTIVE",
    };
  }

  const stateAfter = await currentState(convo.id, organizationId);

  if (!loop.text) {
    return {
      status: "silent",
      reason:
        loop.stopped === "max_steps"
          ? `Hit the ${env.MAX_AGENT_STEPS}-step cap without producing a reply.`
          : "The model returned no text.",
      bubbles: [],
      messageIds: [],
      toolCalls: loop.toolCalls,
      steps: loop.steps,
      usage: loop.usage,
      costUsd: loop.costUsd,
      model: loop.model,
      delayMs: 0,
      conversationState: stateAfter,
    };
  }

  const bubbles = splitReply(loop.text, agent.splitMessages ? agent.maxRepliesPerTurn : 1);

  // One transaction: the reply and the money move together or not at all.
  const messageIds: string[] = [];
  const created = await prisma.$transaction(
    bubbles.map((body, i) =>
      prisma.message.create({
        data: {
          organizationId,
          conversationId: convo.id,
          direction: "OUTBOUND",
          body,
          aiGenerated: true,
          model: loop.model,
          // The whole turn's cost sits on the first bubble. Splitting it evenly
          // would lose fractions to rounding and stop the messages summing to
          // the conversation total.
          costUsd: i === 0 ? loop.costUsd : null,
          toolCalls:
            i === 0 && loop.toolCalls.length
              ? (loop.toolCalls as unknown as Prisma.InputJsonValue)
              : undefined,
        },
        select: { id: true },
      }),
    ),
  );
  messageIds.push(...created.map((m) => m.id));

  return {
    status: "replied",
    bubbles,
    messageIds,
    toolCalls: loop.toolCalls,
    steps: loop.steps,
    usage: loop.usage,
    costUsd: loop.costUsd,
    model: loop.model,
    delayMs: replyDelayMs(agent),
    conversationState: stateAfter,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// runAgent — the entry point the channels layer and the queue call.
// ─────────────────────────────────────────────────────────────────────────────

/** Matches lib/channels/types.ts — ids only; the text is re-read here. */
export interface AgentJob {
  organizationId: string;
  conversationId: string;
  messageId?: string;
  channelConnectionId?: string;
  /** Shortcut for callers that already have the body. */
  incomingText?: string;
}

export interface AgentRunResult {
  replies: string[];
  status: AgentTurnStatus;
  reason?: string;
  delayMs: number;
  costUsd: number;
  toolCalls: ExecutedToolCall[];
  conversationState: ConversationState;
}

/**
 * Resolve a queued job into a turn.
 *
 * The job carries ids, not text, so a job that waited in Redis through a
 * restart answers the conversation as it is NOW. When several messages arrived
 * while we were away, the newest inbound message is the one answered — the
 * others are already in the history the prompt sees, so nothing is lost, and
 * replying once to "are you there?" beats replying three times.
 */
export async function runAgent(job: AgentJob): Promise<AgentRunResult> {
  let incomingText = job.incomingText?.trim();

  if (!incomingText) {
    const message = job.messageId
      ? await prisma.message.findFirst({
          where: {
            id: job.messageId,
            organizationId: job.organizationId,
            conversationId: job.conversationId,
          },
          select: { body: true },
        })
      : await prisma.message.findFirst({
          where: {
            conversationId: job.conversationId,
            organizationId: job.organizationId,
            direction: "INBOUND",
          },
          orderBy: { createdAt: "desc" },
          select: { body: true },
        });

    incomingText = message?.body.trim();
  }

  if (!incomingText) {
    throw new Error(
      `No inbound text for conversation ${job.conversationId}` +
        (job.messageId ? ` (message ${job.messageId} missing or in another org)` : ""),
    );
  }

  const turn = await runAgentTurn({
    conversationId: job.conversationId,
    organizationId: job.organizationId,
    incomingText,
  });

  return {
    replies: turn.bubbles,
    status: turn.status,
    reason: turn.reason,
    delayMs: turn.delayMs,
    costUsd: turn.costUsd,
    toolCalls: turn.toolCalls,
    conversationState: turn.conversationState,
  };
}

/** Conversation totals + FAQ credit. Runs whether or not a reply came out. */
async function settleSpend(
  conversationId: string,
  costUsd: number,
  faqs: RetrievedFaq[],
  organizationId: string,
): Promise<void> {
  const faqIds = faqs.map((f) => f.id).filter(Boolean);
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), totalCostUsd: { increment: costUsd } },
    }),
    // useCount is how a business sees which answers earn their place. Bumped for
    // what was put in front of the model, which is what "used" can mean without
    // asking the model to report it.
    ...(faqIds.length
      ? [
          prisma.faq.updateMany({
            where: { id: { in: faqIds }, organizationId },
            data: { useCount: { increment: 1 } },
          }),
        ]
      : []),
  ]);
}

/** alertHuman may have moved the conversation mid-turn; report what it is now. */
async function currentState(
  conversationId: string,
  organizationId: string,
): Promise<ConversationState> {
  const row = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
    select: { state: true },
  });
  return row?.state ?? "AI_ACTIVE";
}
