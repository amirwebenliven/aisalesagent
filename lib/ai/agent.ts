import type { ConversationState, Message, Prisma } from "@prisma/client";
import type { OutboundMessage } from "../channels/types";
import { prisma } from "../db";
import { env } from "../env";
import { retrieveFaqs as rankFaqs, type RetrievedFaq } from "../knowledge/retrieve";
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
import { executeTool, getToolDefs, type ToolAttachment, type ToolContext } from "./tools";

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

/** Sized for retrieve.ts: plainto_tsquery over more than this is all noise. */
const RETRIEVAL_QUERY_MAX_CHARS = 600;
/**
 * Five, not three: a real WhatsApp customer sends "are you there?", "please
 * send the price", "hello?" — three turns of filler that carry no words and
 * pushed the product out of a three-turn window on the first live test.
 */
const RETRIEVAL_CONTEXT_INBOUND = 5;
const RETRIEVAL_CONTEXT_OUTBOUND = 2;
/** How many FAQs a conversation remembers between turns (Conversation.contextFaqIds). */
const STICKY_FAQS_KEPT = 8;
/** How many of those get a guaranteed slot in the next turn's knowledge block. */
const STICKY_FAQS_SLOTS = 3;

/**
 * Chat filler that must not reach the ranker. lib/knowledge/retrieve.ts keeps
 * only the FIRST twelve non-stopword words of the query for its overlap pass,
 * and its stopword list is the grammatical kind (the, and, what…). A real
 * transcript is mostly the OTHER kind — "ok please send me", "yes also can
 * you", "let me check", "hold on" — and measured against the live tenant those
 * twelve slots were all spent on it before the product's name was reached, so
 * the query "knew" about the saree and still retrieved the generic price FAQs.
 * Words that describe the act of asking, not the thing asked about.
 */
const RETRIEVAL_FILLER = new Set([
  "hi", "hii", "hiii", "hey", "hello", "helo", "ok", "okay", "yes", "yeah", "yep", "yup",
  "no", "nope", "sure", "fine", "great", "good", "nice", "thanks", "thank", "thankyou",
  "please", "pls", "plz", "sorry", "welcome",
  "send", "sending", "sent", "share", "give", "show", "tell", "let", "know", "want",
  "need", "like", "looking", "look", "check", "find", "help", "get", "provide", "wait",
  "hold", "moment", "just", "also", "here", "now", "problem", "directly", "either",
  "more", "some", "one", "its", "him", "her", "his", "who", "which", "may", "might",
  "right", "well", "actually", "really", "still",
]);

/**
 * The text the FAQs are retrieved FOR — the new message plus what the customer
 * and the agent just said.
 *
 * Retrieval used to search only the incoming message. A customer who asked
 * about a red saree, then three turns later "ok please send me the price
 * details", got the 62 generic price FAQs and not the saree's — the product
 * named three messages up was simply not in the query. The FAQ existed.
 *
 * Order matters because of that twelve-word cap. Incoming text first, so the
 * literal question always gets its words in. Then the agent's LAST reply: it
 * was written from the knowledge base, so it names the product in the FAQ's own
 * words ("handprinted silk blend sarees in maroon") where the customer said
 * "red saree". Then the customer's own recent messages, newest first, for
 * whatever the agent has not restated yet.
 *
 * Deterministic for the same inputs, which is all the ordering guarantee in
 * lib/knowledge/retrieve.ts needs from us. Exported so scripts/replay.ts runs
 * the identical query and cannot drift from the live path.
 */
export type RetrievalHistoryItem = Pick<Message, "direction" | "body"> & { aiGenerated?: boolean };

export function buildRetrievalQuery(incoming: string, history: RetrievalHistoryItem[]): string {
  const inbound = history
    .filter((m) => m.direction === "INBOUND")
    .slice(-RETRIEVAL_CONTEXT_INBOUND)
    .reverse();

  // The agent's last replies WITH words. A photo row's body is its caption,
  // often empty; a colleague's "hi" from the inbox is a reply too but names
  // nothing. The AI's own replies are the ones written from the knowledge base,
  // so they are preferred — a human's outbound only counts when there is no AI
  // reply at all (the history rows the sandbox and replay build carry no
  // aiGenerated flag, and every outbound there is the agent's).
  const outbound = history.filter((m) => m.direction === "OUTBOUND" && m.body.trim()).reverse();
  const ai = outbound.filter((m) => m.aiGenerated !== false);
  const recentReplies = (ai.length ? ai : outbound).slice(0, RETRIEVAL_CONTEXT_OUTBOUND);

  const sources = [incoming, ...recentReplies.map((m) => m.body), ...inbound.map((m) => m.body)];

  // Dedupe on the bare word — "Saree", "saree," and "saree?" are one term to
  // the ranker and three to a naive Set — but emit the word as typed, so what
  // reaches plainto_tsquery still reads as language.
  const seen = new Set<string>();
  const words: string[] = [];
  for (const source of sources) {
    for (const token of source.split(/\s+/)) {
      const word = token.trim();
      if (!word) continue;
      const key = word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      if (!key || seen.has(key) || RETRIEVAL_FILLER.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
  }

  let query = "";
  for (const word of words) {
    if (query.length + word.length + 1 > RETRIEVAL_QUERY_MAX_CHARS) break;
    query += (query ? " " : "") + word;
  }
  return query;
}

/**
 * Top FAQs for this turn.
 *
 * Ranking itself lives in lib/knowledge/retrieve.ts (Postgres full-text, with a
 * word-overlap second pass). This wrapper decides WHAT is ranked, in two passes:
 *
 *   1. The literal question — the incoming text with the filler stripped.
 *   2. The question in context — buildRetrievalQuery over the recent turns.
 *
 * Two passes, not one, because a single context-rich query has a failure mode
 * the old incoming-only query did not. Measured on the live tenant: after four
 * turns about a saree, "Do you deliver to Dubai?" as one merged query returned
 * eight saree FAQs and no delivery FAQ — the shop has 25 saree FAQs and every
 * one of them out-scored the delivery answer on "handprinted silk blend". The
 * literal question keeps half the slots so the topic can move; the context
 * pass fills the rest so "ok, the price?" still finds the saree's price and not
 * the 62 generic ones. With no history the two queries are the same and the
 * second pass is skipped.
 *
 * Then the STICKY rows — the FAQs this conversation's earlier turns were
 * answered from (Conversation.contextFaqIds, newest first). Text windows have a
 * horizon; a customer does not. On the first live test the product was named,
 * then came seven turns of "please send the price" / "are you there?", and by
 * the time a colleague handed the thread back nothing in the last five turns
 * said "saree" — so the saree's price FAQ ranked eighth behind six handkerchief
 * prices and the model escalated again. The FAQs already used are the
 * conversation's subject; they keep a few guaranteed slots until the customer
 * moves on and the literal matches crowd them out.
 *
 * Then the house fallback: when nothing matches at all, the model still does
 * better with the business's best answers in front of it than with an empty
 * knowledge section.
 *
 * Was a dynamic import behind a catch-all while the knowledge track was being
 * written in parallel; that also swallowed real query errors and erased the
 * ranking fields, so it is a plain static call now.
 *
 * Exported for scripts/replay.ts and the try-it-out sandbox, so both see the
 * FAQs the live turn would see. Read-only: useCount is bumped by settleSpend,
 * which only the live turn calls.
 */
export async function retrieveFaqsForTurn(
  organizationId: string,
  incoming: string,
  history: RetrievalHistoryItem[],
  take: number,
  opts: { sticky?: string[] } = {},
): Promise<RetrievedFaq[]> {
  const literal = buildRetrievalQuery(incoming, []);
  const contextual = buildRetrievalQuery(incoming, history);

  const stickyIds = (opts.sticky ?? []).slice(0, STICKY_FAQS_KEPT);
  const [direct, inContext, stickyRows] = await Promise.all([
    rankFaqs(organizationId, literal, take),
    contextual !== literal ? rankFaqs(organizationId, contextual, take) : Promise.resolve([] as RetrievedFaq[]),
    stickyIds.length
      ? prisma.faq.findMany({
          // organizationId in the WHERE: the ids come from our own row, but a
          // refresh may have deleted them and nothing here may ever read another
          // tenant's FAQ by a stale id.
          where: { organizationId, id: { in: stickyIds } },
          select: { id: true, question: true, answer: true, sourceUrl: true, imageUrl: true, isManual: true },
        })
      : Promise.resolve([]),
  ]);

  // Stored order = newest first; findMany returns any order.
  const byId = new Map(stickyRows.map((f) => [f.id, f]));
  const sticky: RetrievedFaq[] = stickyIds
    .map((id) => byId.get(id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    // score 0.5: below any real match, above the fallback's 0 — a row is here
    // because it mattered a turn ago, not because it matched this turn.
    .map((f) => ({ ...f, score: 0.5 }));

  // Literal matches first (up to half), then the sticky rows (a few slots),
  // then context, then whatever literal and sticky matches are left. Dedupe on
  // id — the same FAQ usually tops several lists. Deterministic given
  // deterministic inputs, which keeps the knowledge block byte-identical when
  // nothing about the conversation has changed.
  const directShare = Math.ceil(take / 2);
  const picked: RetrievedFaq[] = [];
  const seen = new Set<string>();
  const add = (f: RetrievedFaq) => {
    if (picked.length >= take || seen.has(f.id)) return;
    seen.add(f.id);
    picked.push(f);
  };
  direct.slice(0, directShare).forEach(add);
  sticky.slice(0, STICKY_FAQS_SLOTS).forEach(add);
  inContext.forEach(add);
  direct.slice(directShare).forEach(add);
  sticky.slice(STICKY_FAQS_SLOTS).forEach(add);
  if (picked.length) return picked;

  const fallback = await prisma.faq.findMany({
    where: { organizationId },
    // Hand-written FAQs outrank generated ones (CLAUDE.md §7). The id tiebreak
    // keeps the order stable as useCount moves, so the same fallback set prints
    // the same way turn after turn.
    orderBy: [{ isManual: "desc" }, { useCount: "desc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      question: true,
      answer: true,
      sourceUrl: true,
      imageUrl: true,
      isManual: true,
    },
  });

  // score 0 = "not matched, offered as background" — keeps the row shape honest
  // rather than inventing a relevance number nothing computed.
  return fallback.map((f) => ({ ...f, score: 0 }));
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
  /** Photos the model queued with sendImage. Persisted and sent AFTER the bubbles. */
  attachments: ToolAttachment[];
  /** One per bubble, then one per attachment — the same order they were persisted in. */
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
    attachments: [],
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
    // mediaUrl too: a photo the agent sent is replayed to the model as a note
    // (see buildMessages), otherwise it cannot tell it already sent one.
    // aiGenerated: retrieval prefers the AI's own replies over a colleague's.
    select: { direction: true, body: true, createdAt: true, mediaUrl: true, aiGenerated: true },
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

  const faqs = await retrieveFaqsForTurn(organizationId, args.incomingText, history, 8, {
    sticky: convo.contextFaqIds,
  });

  const cfg = await resolveModelConfig(organizationId);
  const messages = buildMessages({
    agent,
    contact: convo.contact,
    conversation: { summary: convo.summary },
    // Passed whole: the prompt prints sourceUrl and imageUrl alongside Q and A,
    // which is how the model learns it has a link and a photo to offer.
    faqs,
    history,
    incoming: args.incomingText,
  });

  const ctx: ToolContext = {
    organizationId,
    conversationId: convo.id,
    contactId: convo.contactId,
    // Fresh per turn. sendImage appends here; what is in it after the loop is
    // what gets persisted and sent behind the text.
    attachments: [],
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
  await settleSpend(convo.id, loop.costUsd, faqs, organizationId, convo.contextFaqIds);

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
      attachments: [],
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
  const attachments = ctx.attachments ?? [];

  // A photo with no words is still a reply — "send me a picture" answered with
  // the picture is exactly what the customer asked for.
  if (!loop.text && !attachments.length) {
    return {
      status: "silent",
      reason:
        loop.stopped === "max_steps"
          ? `Hit the ${env.MAX_AGENT_STEPS}-step cap without producing a reply.`
          : "The model returned no text.",
      bubbles: [],
      attachments: [],
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

  const bubbles = loop.text
    ? splitReply(loop.text, agent.splitMessages ? agent.maxRepliesPerTurn : 1)
    : [];

  // Text first, then the photos: the customer reads "here it is" and then sees
  // it, the way a person sends them. Each photo is its own Message row so the
  // inbox thread and the widget's poll show it in place, with the caption as
  // the body (empty when there is none — the mediaUrl is the content).
  const rows: { body: string; mediaUrl: string | null }[] = [
    ...bubbles.map((body) => ({ body, mediaUrl: null })),
    ...attachments.map((a) => ({ body: a.caption ?? "", mediaUrl: a.url })),
  ];

  // One transaction: the reply and the money move together or not at all.
  const messageIds: string[] = [];
  const created = await prisma.$transaction(
    rows.map((row, i) =>
      prisma.message.create({
        data: {
          organizationId,
          conversationId: convo.id,
          direction: "OUTBOUND",
          body: row.body,
          mediaUrl: row.mediaUrl,
          aiGenerated: true,
          model: loop.model,
          // The whole turn's cost sits on the first row. Splitting it evenly
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
    attachments,
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
  /**
   * What the adapter sends, in order: the text bubbles, then one message per
   * photo ({ text: caption, mediaUrl }). Every sender passes these straight to
   * adapter.send() — the same shape lib/channels/types.ts has always taken.
   */
  replies: OutboundMessage[];
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
    replies: toOutbound(turn),
    status: turn.status,
    reason: turn.reason,
    delayMs: turn.delayMs,
    costUsd: turn.costUsd,
    toolCalls: turn.toolCalls,
    conversationState: turn.conversationState,
  };
}

/** Bubbles first, photos after — the order they were persisted in and must be sent in. */
function toOutbound(turn: Pick<AgentTurnResult, "bubbles" | "attachments">): OutboundMessage[] {
  return [
    ...turn.bubbles.map((text) => ({ text })),
    ...turn.attachments.map((a) => ({ text: a.caption ?? "", mediaUrl: a.url })),
  ];
}

/**
 * The FAQs the next turn should still see: this turn's MATCHED rows (score > 0
 * — the house fallback is background, not the conversation's subject) in
 * prompt order, then what was remembered before, deduped and capped. Exported
 * for scripts/replay.ts, so a replay carries context between turns exactly as
 * a live conversation does.
 */
export function nextStickyFaqIds(faqs: RetrievedFaq[], previous: string[]): string[] {
  const matched = faqs.filter((f) => f.score > 0).map((f) => f.id);
  return [...new Set([...matched, ...previous])].slice(0, STICKY_FAQS_KEPT);
}

/** Conversation totals + FAQ credit + sticky context. Runs whether or not a reply came out. */
async function settleSpend(
  conversationId: string,
  costUsd: number,
  faqs: RetrievedFaq[],
  organizationId: string,
  previousSticky: string[],
): Promise<void> {
  const faqIds = faqs.map((f) => f.id).filter(Boolean);
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        totalCostUsd: { increment: costUsd },
        contextFaqIds: nextStickyFaqIds(faqs, previousSticky),
      },
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
