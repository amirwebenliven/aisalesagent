import type { ChannelConnection, ChannelKind } from "@prisma/client";

/**
 * ONE interface for every channel (CLAUDE.md §2). Adding a channel must never
 * require touching agent code: the agent only ever sees an InboundMessage and
 * hands back text, and the adapter owns everything provider-shaped — auth,
 * payload quirks, and the id that makes redelivery harmless.
 */

export type ChannelId = "widget" | "telegram" | "whatsapp" | "email";

export const KIND_FOR_CHANNEL: Record<ChannelId, ChannelKind> = {
  widget: "WIDGET",
  telegram: "TELEGRAM",
  whatsapp: "WHATSAPP_QR",
  email: "EMAIL",
};

/**
 * Who sent it, in the provider's own terms. `externalId` must be STABLE for the
 * same human on the same channel — it is what a Contact is keyed on, so a
 * value that changes per message would create a new contact per message.
 */
export interface InboundContact {
  externalId: string;
  name?: string;
  email?: string;
  phone?: string;
  locale?: string;
}

export interface InboundMessage {
  channel: ChannelId;

  /**
   * THE deduplication key — lands in Message.providerId, which is @@unique.
   * Every provider redelivers (Telegram retries any webhook that is slow or
   * non-200), so this MUST be derivable from the payload alone and identical
   * across redeliveries of the same event.
   */
  providerId: string;

  /** Where a reply is sent — Telegram chat id, widget visitorId. Also the conversation key. */
  conversationRef: string;

  contact: InboundContact;
  text: string;
  mediaUrl?: string;
  sentAt: Date;

  /** An edit of an earlier message. Stored as its own turn, with its own providerId. */
  edited?: boolean;
}

export interface OutboundMessage {
  text: string;
  mediaUrl?: string;
}

export interface SendResult {
  /** Absent when the channel has no push transport (the widget replies in-band). */
  providerId?: string;
}

export interface ChannelAdapter {
  id: ChannelId;

  /** null = ignore this update: delivery receipts, presence, joins, edits we don't handle. */
  parseInbound(raw: unknown): InboundMessage | null;

  /** One call per bubble — see sendBubbles() in ./index for ordering. */
  send(connection: ChannelConnection, to: string, msg: OutboundMessage): Promise<SendResult>;

  /** Signature / shared-secret check. Runs BEFORE anything is persisted. */
  verify?(req: Request, connection: ChannelConnection): boolean | Promise<boolean>;
}

/** What a webhook hands to the queue. Deliberately ids only — the worker re-reads. */
export interface InboundJob {
  organizationId: string;
  conversationId: string;
  messageId: string;
  channelConnectionId: string;
}

/** What an inline (queue-less) agent run gives back, for channels whose visitor is waiting. */
export interface AgentRunResult {
  replies?: string[];
}
