import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dispatchInbound, persistInbound, telegramAdapter } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram inbound.
 *
 * The only job here is: authenticate, persist, enqueue, return 200 — fast.
 * Telegram retries anything slow or non-200, and a retried webhook that re-ran
 * the agent would answer the customer twice and bill us twice. The model is
 * never called from this file.
 *
 * Status codes are load-bearing, because they decide whether Telegram tries again:
 *   404 unknown secret   — not our bot; retrying will never help.
 *   401 bad secret token — someone who found the URL. Same.
 *   200 duplicate        — already stored. THE dedup path; it fires in normal operation.
 *   500 database error   — we WANT the retry, and dedup makes it safe.
 */
export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;

  const connection = await prisma.channelConnection.findUnique({
    where: { webhookSecret: secret },
  });

  if (!connection || connection.kind !== "TELEGRAM") {
    return NextResponse.json({ ok: false, error: "Unknown webhook" }, { status: 404 });
  }

  // The path segment is not authentication — URLs turn up in proxy logs. The
  // header is what proves this is Telegram.
  if (!(await telegramAdapter.verify?.(req, connection))) {
    return NextResponse.json({ ok: false, error: "Bad secret token" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const msg = telegramAdapter.parseInbound(raw);

  // Edits we don't handle, joins, pure media, bot echoes. Acknowledge so
  // Telegram stops resending, and do nothing.
  if (!msg) return NextResponse.json({ ok: true, ignored: true });

  const result = await persistInbound(connection, msg);
  if (result.deduped) return NextResponse.json({ ok: true, deduped: true });

  // A human has taken the thread over, or the contact is bot-excluded. The
  // message is stored and shows up in the inbox; the AI stays quiet.
  if (!result.botShouldReply || !result.job) {
    return NextResponse.json({ ok: true, queued: false, reason: "bot paused for this thread" });
  }

  const dispatch = await dispatchInbound(result.job);

  if (dispatch.mode === "dropped") {
    // Persisted but unanswered — visible rather than silent, because "the bot
    // said nothing" is otherwise indistinguishable from "the bot chose not to".
    console.warn(`[telegram] ${dispatch.reason} (message ${result.messageId})`);
  }

  return NextResponse.json({ ok: true, mode: dispatch.mode });
}

/** Telegram only ever POSTs; a GET here is a human checking the URL by hand. */
export async function GET() {
  return NextResponse.json({ ok: true, note: "Telegram webhook endpoint — POST only." });
}
