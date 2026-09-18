import type { ChannelConnection, ChannelKind } from "@prisma/client";
import { runAgent } from "../ai/agent";
import { prisma } from "../db";
import { enqueueInbound, type InboundJob } from "../queue";
import { telegramAdapter } from "./telegram";
import { whatsappAdapter } from "./whatsapp";
import { widgetAdapter } from "./widget";
import type { ChannelAdapter, ChannelId, InboundMessage, OutboundMessage } from "./types";

export * from "./types";
/** Canonical home is lib/queue.ts; re-exported so `from "@/lib/channels"` keeps working. */
export type { InboundJob } from "../queue";
export { telegramAdapter, connectTelegram, disconnectTelegram, sendTyping } from "./telegram";
export {
  whatsappAdapter,
  connectWhatsApp,
  whatsappSessionState,
  whatsappQrDataUrl,
  whatsappWebhookAuthentic,
  whatsappWebhookUrl,
  applySessionStatus,
  checkSendAllowance,
  dailyCapFor,
  warmupDay,
  WARMUP_DAYS,
} from "./whatsapp";
export { widgetAdapter, widgetSettings, ensureWidgetConnection, widgetEmbedSnippet } from "./widget";

/** The registry. A new channel is one entry here plus its adapter file. */
const ADAPTERS: Partial<Record<ChannelKind, ChannelAdapter>> = {
  TELEGRAM: telegramAdapter,
  WHATSAPP_QR: whatsappAdapter,
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
    conversation.state === "AI_ACTIVE" &&
    !contact.botExcluded &&
    connection.status !== "PAUSED" &&
    connection.status !== "DISCONNECTED";

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

export interface DispatchResult {
  /** "queued" | "inline" | "dropped" — how the turn was handled. */
  mode: "queued" | "inline" | "dropped";
  /** Text bubbles first, then any photos as { text: caption, mediaUrl }. Empty unless inline. */
  replies: OutboundMessage[];
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
    try {
      // Resolves for BOTH a real Redis enqueue and the in-process fallback: each
      // means something has taken the job and this request is free to return.
      await enqueueInbound(job);
      return { mode: "queued", replies: [] };
    } catch (e) {
      // Nothing accepted the job — Redis is down AND no worker is registered
      // here. Running it inline is slower and holds the request open, but it
      // answers the customer, which beats silence.
      console.warn(
        `[channels] enqueue failed, running inline: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // A throw here would 500 the webhook, and a provider retries a non-200 — but
  // the message is already persisted, so the retry dedups and the customer is
  // never answered. "dropped" carries the real reason back to the route instead.
  const run = runAgent(job).catch((e: unknown) => {
    console.error("[channels] inline agent run failed:", e);
    return e instanceof Error ? e : new Error(String(e));
  });

  if (!opts.timeoutMs) {
    const result = await run;
    if (result instanceof Error) return { mode: "dropped", replies: [], reason: result.message };
    return { mode: "inline", replies: result.replies };
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
    if (result instanceof Error) return { mode: "dropped", replies: [], reason: result.message };
    return { mode: "inline", replies: result.replies };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One provider call per message, in order. Sequential on purpose: fired in
 * parallel they arrive shuffled, and a two-bubble answer read backwards is
 * worse than one long paragraph — and a photo landing before "here it is" reads
 * as a mistake.
 *
 * Takes OutboundMessage objects (a photo is `{ text: caption, mediaUrl }`) and
 * still accepts bare strings, because the inbox's human reply and the follow-up
 * sweep only ever send text and should not have to wrap it.
 */
export async function sendBubbles(
  connection: ChannelConnection,
  to: string,
  bubbles: (string | OutboundMessage)[],
  opts: { gapMs?: number } = {},
): Promise<string[]> {
  const adapter = getAdapter(connection.kind);
  const ids: string[] = [];

  // A disconnected channel has nothing to send with — its credentials are gone.
  // The rows are persisted and visible in the inbox; delivery is impossible, and
  // throwing here would make the queue retry a job that can never succeed.
  if (connection.status === "DISCONNECTED") {
    console.warn(
      `[channels] ${connection.kind} ${connection.id} is disconnected — ${bubbles.length} message(s) stored, not sent`,
    );
    return ids;
  }

  for (const [i, bubble] of bubbles.entries()) {
    if (i > 0 && opts.gapMs) await new Promise((r) => setTimeout(r, opts.gapMs));
    const msg: OutboundMessage = typeof bubble === "string" ? { text: bubble } : bubble;

    if (msg.mediaUrl) {
      // Photos go out AFTER the text bubbles, so by the time one fails the
      // customer already has the words. If this threw, the job would fail and
      // BullMQ would retry it up to three times (lib/queue.ts) — re-running the
      // model and re-sending text the customer has already read. Telegram
      // rejects photos over 5 MB or from a host with the wrong content-type,
      // and WAHA's fetch can fail inside the container; neither is worth a
      // duplicate reply. The photo is best-effort: fall back to the caption
      // plus the URL as text, and if even that fails, log it and move on. The
      // row is in the inbox either way.
      try {
        const { providerId } = await adapter.send(connection, to, msg);
        if (providerId) ids.push(providerId);
      } catch (err) {
        console.warn(
          `[channels] photo not delivered on ${connection.kind} ${connection.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        try {
          const text = [msg.text, msg.mediaUrl].filter(Boolean).join("\n");
          const { providerId } = await adapter.send(connection, to, { text });
          if (providerId) ids.push(providerId);
        } catch (err2) {
          console.warn(
            `[channels] photo fallback text not delivered either: ` +
              (err2 instanceof Error ? err2.message : String(err2)),
          );
        }
      }
      continue;
    }

    const { providerId } = await adapter.send(connection, to, msg);
    if (providerId) ids.push(providerId);
  }

  return ids;
}
