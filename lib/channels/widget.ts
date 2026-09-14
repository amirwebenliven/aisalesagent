import type { ChannelConnection } from "@prisma/client";
import { prisma } from "../db";
import { decryptJson, encryptJson } from "../crypto";
import { env } from "../env";
import type { ChannelAdapter, InboundMessage, SendResult } from "./types";

/**
 * The website chat widget.
 *
 * The thing that makes this channel different: there is no push transport. The
 * visitor is sitting there watching, so the reply comes back in the HTTP
 * response of the message they just sent, and anything the agent produces
 * afterwards is picked up by a poll (GET on the same route). That is why
 * `send()` below is a no-op — the outbound Message row IS the delivery.
 *
 * Identity is a client-generated UUID in localStorage. It is not authentication
 * and must never be treated as such: a visitor can mint a new one by clearing
 * storage, and a hostile one can send any id they like. It buys conversation
 * continuity across page loads, nothing more.
 */

const MAX_MESSAGE_CHARS = 4000; // one pasted novel should not become a model bill

export interface WidgetSettings {
  /** Empty/absent = any origin. The embed secret is public (it sits in page source). */
  allowedOrigins?: string[];
  greeting?: string;
  title?: string;
}

export interface WidgetInboundPayload {
  visitorId: string;
  message: string;
  /** Generated per send by widget.js. Without it a retry is indistinguishable from a new message. */
  clientMessageId?: string;
  name?: string;
  email?: string;
  page?: string;
  locale?: string;
}

export function widgetSettings(connection: ChannelConnection): WidgetSettings {
  if (!connection.credentialsEnc) return {};
  return decryptJson<WidgetSettings>(connection.credentialsEnc);
}

/** Create (or return) the single widget channel for an org, and its embed snippet. */
export async function ensureWidgetConnection(params: {
  organizationId: string;
  agentId?: string | null;
  displayName?: string;
  settings?: WidgetSettings;
}): Promise<{ connection: ChannelConnection; embed: string }> {
  const existing = await prisma.channelConnection.findFirst({
    where: { organizationId: params.organizationId, kind: "WIDGET" },
    orderBy: { createdAt: "asc" },
  });

  const connection =
    existing ??
    (await prisma.channelConnection.create({
      data: {
        organizationId: params.organizationId,
        agentId: params.agentId ?? null,
        kind: "WIDGET",
        displayName: params.displayName ?? "Website widget",
        status: "ACTIVE",
        credentialsEnc: params.settings ? encryptJson(params.settings) : null,
      },
    }));

  return { connection, embed: widgetEmbedSnippet(connection.webhookSecret) };
}

export function widgetEmbedSnippet(webhookSecret: string): string {
  const base = env.APP_URL.replace(/\/$/, "");
  return `<script src="${base}/widget.js" data-secret="${webhookSecret}" defer></script>`;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export const widgetAdapter: ChannelAdapter = {
  id: "widget",

  parseInbound(raw: unknown): InboundMessage | null {
    const p = raw as WidgetInboundPayload | null;
    if (!p || typeof p !== "object") return null;

    const visitorId = str(p.visitorId);
    const text = str(p.message);
    if (!visitorId || !text) return null;

    // A visitorId is echoed back into ids and logs — bound it so a crafted one
    // cannot bloat a primary key or smuggle a path separator anywhere.
    if (visitorId.length > 64 || /[^A-Za-z0-9_:-]/.test(visitorId)) return null;

    const clientMessageId = str(p.clientMessageId)?.slice(0, 64);

    return {
      channel: "widget",
      // Falls back to a timestamp when the client sends no id, which makes a
      // double-submit a duplicate turn instead of a duplicate row. widget.js
      // always sends one; anything else is a hand-rolled integration.
      providerId: `wg:${visitorId}:${clientMessageId ?? Date.now()}`,
      conversationRef: visitorId,
      contact: {
        externalId: visitorId,
        name: str(p.name),
        email: str(p.email),
        locale: str(p.locale),
      },
      text: text.slice(0, MAX_MESSAGE_CHARS),
      sentAt: new Date(),
    };
  },

  // No push transport. The agent's reply is persisted as an OUTBOUND Message
  // and delivered either in the POST response or by the widget's next poll.
  async send(): Promise<SendResult> {
    return {};
  },

  // The embed secret is public by design, so there is nothing to verify here.
  // Abuse is bounded by origin allow-listing and the per-visitor rate limit in
  // the route, not by a signature.
  verify() {
    return true;
  },
};
