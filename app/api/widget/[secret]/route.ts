import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  conversationKey,
  dispatchInbound,
  persistInbound,
  widgetAdapter,
  widgetSettings,
} from "@/lib/channels";
import type { ChannelConnection } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The widget's public endpoint. Unlike every other channel this one MAY wait
 * for the reply and return it, because a visitor is sitting there watching a
 * typing indicator — there is no push transport to deliver it later.
 *
 * The wait is bounded (REPLY_TIMEOUT_MS). If the agent is slower than that we
 * return `pending` and the widget polls GET for what lands afterwards, so a
 * slow model never leaves a browser hanging.
 *
 *   POST  { visitorId, message, clientMessageId?, name?, email?, page? }
 *   GET   ?visitorId=…&after=<iso>   → messages since the cursor (history + late replies)
 */

const REPLY_TIMEOUT_MS = 25_000;

// Per-visitor throttle. The embed secret is public by design — it sits in the
// customer's page source — so the only thing between a bored visitor and our
// model bill is this. In-process and therefore per-instance: move it to Redis
// alongside the queue.
const RATE_LIMIT = { windowMs: 60_000, max: 15 };
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(key, recent);

  // The map is unbounded otherwise: one entry per visitor, forever.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_LIMIT.windowMs)) hits.delete(k);
  }

  return recent.length > RATE_LIMIT.max;
}

/**
 * The widget runs on the customer's domain, not ours, so CORS has to be
 * permissive by default — we cannot know their domain until they tell us.
 * If they HAVE listed origins, anything else is refused outright.
 */
function corsHeaders(connection: ChannelConnection | null, origin: string | null): HeadersInit {
  const allowed = connection ? widgetSettings(connection).allowedOrigins : undefined;
  const value = !allowed?.length ? "*" : origin && allowed.includes(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": value,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    // Without this a CDN can serve one customer's allowed origin to another.
    Vary: "Origin",
  };
}

function originBlocked(connection: ChannelConnection, origin: string | null): boolean {
  const allowed = widgetSettings(connection).allowedOrigins;
  if (!allowed?.length) return false;
  return !origin || !allowed.includes(origin);
}

async function findWidget(secret: string): Promise<ChannelConnection | null> {
  const connection = await prisma.channelConnection.findUnique({ where: { webhookSecret: secret } });
  return connection && connection.kind === "WIDGET" ? connection : null;
}

export async function OPTIONS(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const connection = await findWidget(secret);
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(connection, req.headers.get("origin")),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const origin = req.headers.get("origin");
  const connection = await findWidget(secret);

  if (!connection) {
    return NextResponse.json({ ok: false, error: "Unknown widget" }, { status: 404 });
  }
  const headers = corsHeaders(connection, origin);

  if (originBlocked(connection, origin)) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403, headers });
  }
  if (connection.status === "PAUSED") {
    return NextResponse.json({ ok: false, error: "Widget paused" }, { status: 409, headers });
  }

  const raw = await req.json().catch(() => null);
  const msg = widgetAdapter.parseInbound(raw);
  if (!msg) {
    return NextResponse.json(
      { ok: false, error: "visitorId and a non-empty message are required" },
      { status: 400, headers },
    );
  }

  if (rateLimited(`${secret}:${msg.contact.externalId}`)) {
    return NextResponse.json(
      { ok: false, error: "Too many messages — slow down a moment." },
      { status: 429, headers },
    );
  }

  const result = await persistInbound(connection, msg);

  // A resend of a message we already have. Returning the replies we have
  // already stored keeps a reconnecting widget in sync instead of blank.
  if (result.deduped) {
    return NextResponse.json(
      { ok: true, deduped: true, replies: [], pending: false },
      { headers },
    );
  }

  if (!result.botShouldReply || !result.job) {
    return NextResponse.json(
      { ok: true, messageId: result.messageId, replies: [], pending: false, human: true },
      { headers },
    );
  }

  const dispatch = await dispatchInbound(result.job, {
    inline: true,
    timeoutMs: REPLY_TIMEOUT_MS,
  });

  return NextResponse.json(
    {
      ok: true,
      messageId: result.messageId,
      replies: dispatch.replies,
      // Nothing to show yet: either the agent module isn't wired up, or it is
      // still working. Either way the widget polls GET from here.
      pending: dispatch.replies.length === 0,
      ...(dispatch.mode === "dropped" ? { note: dispatch.reason } : {}),
    },
    { headers },
  );
}

/** History on open, and the poll for replies that arrive after POST gave up waiting. */
export async function GET(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const origin = req.headers.get("origin");
  const connection = await findWidget(secret);

  if (!connection) {
    return NextResponse.json({ ok: false, error: "Unknown widget" }, { status: 404 });
  }
  const headers = corsHeaders(connection, origin);

  if (originBlocked(connection, origin)) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403, headers });
  }

  const url = new URL(req.url);
  const visitorId = url.searchParams.get("visitorId")?.trim();
  if (!visitorId || visitorId.length > 64 || /[^A-Za-z0-9_:-]/.test(visitorId)) {
    return NextResponse.json({ ok: false, error: "visitorId required" }, { status: 400, headers });
  }

  const afterRaw = url.searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  const since = after && !Number.isNaN(after.getTime()) ? after : null;

  const messages = await prisma.message.findMany({
    // Scoped by organization as well as conversation: the conversation id is
    // derived from a client-supplied visitorId, so it is never trusted alone.
    where: {
      organizationId: connection.organizationId,
      conversationId: conversationKey(connection.id, visitorId),
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, direction: true, body: true, createdAt: true },
  });

  return NextResponse.json(
    {
      ok: true,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.direction === "INBOUND" ? "user" : "agent",
        text: m.body,
        at: m.createdAt.toISOString(),
      })),
    },
    { headers },
  );
}
