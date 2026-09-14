import type { ChannelConnection, ChannelKind } from "@prisma/client";
import { prisma } from "../db";
import { telegramAdapter } from "./telegram";
import { widgetAdapter } from "./widget";
import type {
  AgentRunResult,
  ChannelAdapter,
  ChannelId,
  InboundJob,
  InboundMessage,
} from "./types";

export * from "./types";
export { telegramAdapter, connectTelegram, disconnectTelegram, sendTyping } from "./telegram";
export { widgetAdapter, widgetSettings, ensureWidgetConnection, widgetEmbedSnippet } from "./widget";

/** The registry. A new channel is one entry here plus its adapter file. */
const ADAPTERS: Partial<Record<ChannelKind, ChannelAdapter>> = {
  TELEGRAM: telegramAdapter,
  WIDGET: widgetAdapter,
};

export function getAdapter(kind: ChannelKind): ChannelAdapter {
  const adapter = ADAPTERS[kind];
  if (!adapter) throw new Error(`No channel adapter registered for ${kind}`);
  return adapter;
}

export function adapterFor(id: ChannelId): ChannelAdapter {
  const adapter = Object.values(ADAPTERS).find((a) => a?.id === id);
  if (!adapter) throw new Error(`No channel adapter registered for "${id}"`);
  return adapter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persist
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistResult {
  /** True = we have seen this providerId before. The caller returns 200 and stops. */
  deduped: boolean;
  conversationId: string;
  contactId: string;
  messageId?: string;
  job?: InboundJob;
  /** False when a human owns the thread or the contact is excluded — persist, don't answer. */
  botShouldReply: boolean;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Contact and Conversation ids are DERIVED, not random.
 *
 * The schema has no column for a provider's own id, and a find-then-create
 * would race itself the moment a provider redelivers in parallel — which is
 * exactly when it matters. A deterministic primary key turns both into a real
 * upsert: atomic, no extra index, no schema change. The organization id is part
 * of it because two tenants' bots can legitimately be talking to the same
 * Telegram user, and those must never resolve to one contact.
 */
export function contactKey(organizationId: string, channel: ChannelId, externalId: string): string {
  return `${organizationId}:${channel}:${externalId}`;
}

export function conversationKey(channelConnectionId: string, conversationRef: string): string {
  return `${channelConnectionId}:${conversationRef}`;
}

/**
 * The reverse: recover the provider address to reply to from a conversation id.
 * The worker only carries ids, and this is how it gets the Telegram chat id or
 * widget visitorId back without another lookup. Split on the FIRST separator
 * only — a Telegram group chat id is negative and a visitorId may contain ":".
 */
export function conversationRefFrom(conversationId: string, channelConnectionId: string): string {
  const prefix = `${channelConnectionId}:`;
  if (!conversationId.startsWith(prefix)) {
    throw new Error(`Conversation ${conversationId} does not belong to connection ${channelConnectionId}`);
  }
  return conversationId.slice(prefix.length);
}

/**
 * Validate → persist → hand back a job. Shared by every inbound route so the
 * dedup and handover rules cannot drift between channels.
 *
 * Does NOT call the model. Webhooks return 200 in under a second or providers
 * retry, and a retried webhook that re-ran the agent would answer the customer
 * twice and bill us twice (CLAUDE.md §2).
 */
export async function persistInbound(
  connection: ChannelConnection,
  msg: InboundMessage,
): Promise<PersistResult> {
  const organizationId = connection.organizationId;
  const contactId = contactKey(organizationId, msg.channel, msg.contact.externalId);
  const conversationId = conversationKey(connection.id, msg.conversationRef);

  const contact = await prisma.contact.upsert({
    where: { id: contactId },
    create: {
      id: contactId,
      organizationId,
      name: msg.contact.name ?? null,
      email: msg.contact.email ?? null,
      phone: msg.contact.phone ?? null,
      locale: msg.contact.locale ?? null,
      // Makes the provider address findable in the inbox without a schema column.
      tags: [`${msg.channel}:${msg.contact.externalId}`],
    },
    // Empty on purpose: a human may have corrected the name or email in the
    // inbox, and the provider's version must not overwrite that on every
    // message. Gaps are filled below, and the captureContact tool owns the rest.
    update: {},
  });

  if (msg.contact.name && !contact.name) {
    await prisma.contact.update({ where: { id: contactId }, data: { name: msg.contact.name } });
  }

  const conversation = await prisma.conversation.upsert({
    where: { id: conversationId },
    create: {
      id: conversationId,
      organizationId,
      contactId,
      channelConnectionId: connection.id,
      agentId: connection.agentId,
      lastMessageAt: msg.sentAt,
    },
    update: {},
  });

  let messageId: string;
  try {
    const created = await prisma.message.create({
      data: {
        organizationId,
        conversationId,
        direction: "INBOUND",
        body: msg.text,
        mediaUrl: msg.mediaUrl ?? null,
        providerId: msg.providerId,
        createdAt: msg.sentAt,
      },
      select: { id: true },
    });
    messageId = created.id;
  } catch (e) {
    // The dedup path. This WILL fire in production — it is the point of the
    // unique index, not an error.
    if (isUniqueViolation(e)) {
      return { deduped: true, conversationId, contactId, botShouldReply: false };
    }
    throw e;
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: msg.sentAt },
  });

  const botShouldReply =
    conversation.state === "AI_ACTIVE" && !contact.botExcluded && connection.status !== "PAUSED";

  return {
    deduped: false,
    conversationId,
    contactId,
    messageId,
    botShouldReply,
    job: {
      organizationId,
      conversationId,
      messageId,
      channelConnectionId: connection.id,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch — queue first, in-process second
// ─────────────────────────────────────────────────────────────────────────────

type QueueModule = { enqueueInbound?: (job: InboundJob) => Promise<unknown> };
type AgentModule = { runAgent?: (job: InboundJob) => Promise<AgentRunResult | void> };

/**
 * lib/queue.ts and lib/ai/agent.ts are landing alongside this file, so both are
 * loaded lazily and behind a try/catch: a missing module degrades to the next
 * option instead of taking the webhook down with it. Redis is also frequently
 * unreachable in development, which is the same failure from our side.
 *
 * TODO: once both modules are in, swap these for static imports — the lazy form
 * hides a genuine typo until runtime.
 */
async function loadQueue(): Promise<QueueModule | null> {
  try {
    // @ts-ignore — written by a parallel track; may not exist yet.
    return (await import("../queue")) as QueueModule;
  } catch {
    return null;
  }
}

async function loadAgent(): Promise<AgentModule | null> {
  try {
    // @ts-ignore — written by a parallel track; may not exist yet.
    return (await import("../ai/agent")) as AgentModule;
  } catch {
    return null;
  }
}

export interface DispatchResult {
  /** "queued" | "inline" | "dropped" — how the turn was handled. */
  mode: "queued" | "inline" | "dropped";
  replies: string[];
  /** Set when nothing could run it. The message is still persisted, so nothing is lost. */
  reason?: string;
}

/**
 * `inline: true` runs the agent in this request and waits for the reply — only
 * correct for the widget, where a visitor is watching a typing indicator. Every
 * push channel enqueues and returns.
 */
export async function dispatchInbound(
  job: InboundJob,
  opts: { inline?: boolean; timeoutMs?: number } = {},
): Promise<DispatchResult> {
  if (!opts.inline) {
    const queue = await loadQueue();
    if (queue?.enqueueInbound) {
      try {
        await queue.enqueueInbound(job);
        return { mode: "queued", replies: [] };
      } catch (e) {
        // Redis down. Falling through to an in-process run is slower and holds
        // the request open, but it answers the customer — which beats silence.
        console.warn(
          `[channels] enqueue failed, running inline: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  const agent = await loadAgent();
  if (!agent?.runAgent) {
    return {
      mode: "dropped",
      replies: [],
      reason: "No queue and no agent module — message persisted, not answered.",
    };
  }

  const run = Promise.resolve(agent.runAgent(job));

  if (!opts.timeoutMs) {
    const result = await run;
    return { mode: "inline", replies: result?.replies ?? [] };
  }

  // The run keeps going after we give up on it; whatever it writes is picked up
  // by the widget's next poll. Never leave a browser hanging on a model call.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), opts.timeoutMs);
  });

  try {
    const result = await Promise.race([run, timeout]);
    if (result === null) return { mode: "inline", replies: [], reason: "timeout" };
    return { mode: "inline", replies: result?.replies ?? [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One provider call per bubble, in order. Sequential on purpose: fired in
 * parallel they arrive shuffled, and a two-bubble answer read backwards is
 * worse than one long paragraph.
 */
export async function sendBubbles(
  connection: ChannelConnection,
  to: string,
  bubbles: string[],
  opts: { gapMs?: number } = {},
): Promise<string[]> {
  const adapter = getAdapter(connection.kind);
  const ids: string[] = [];

  for (const [i, text] of bubbles.entries()) {
    if (i > 0 && opts.gapMs) await new Promise((r) => setTimeout(r, opts.gapMs));
    const { providerId } = await adapter.send(connection, to, { text });
    if (providerId) ids.push(providerId);
  }

  return ids;
}
