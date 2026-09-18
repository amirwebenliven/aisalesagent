import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dispatchInbound, persistInbound } from "@/lib/channels";
import {
  applySessionStatus,
  whatsappAdapter,
  whatsappWebhookAuthentic,
  type WahaMeInfo,
  type WahaSessionStatus,
  type WahaWebhookEvent,
} from "@/lib/channels/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WAHA inbound — every WhatsApp event for every connection arrives here.
 *
 * Authenticate, persist, enqueue, return 200 — fast. WAHA retries a non-2xx on
 * a backoff, and a retried webhook that re-ran the agent would answer the
 * customer twice and bill us twice. The model is never called from this file.
 *
 * Which connection an event belongs to comes from `?s=<webhookSecret>`, NOT
 * from the session name in the body: the body is the thing being authenticated,
 * so it cannot also be what selects the key used to authenticate it.
 *
 * Status codes decide whether WAHA tries again:
 *   404 unknown secret    — not one of ours; a retry will never help.
 *   401 bad signature     — someone who found the URL. Same.
 *   200 duplicate/ignored — already stored, or an event we do not act on.
 *   500 database error    — we WANT the retry, and dedup makes it safe.
 */
export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("s");
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing connection secret" }, { status: 404 });
  }

  const connection = await prisma.channelConnection.findUnique({
    where: { webhookSecret: secret },
  });

  if (!connection || connection.kind !== "WHATSAPP_QR") {
    return NextResponse.json({ ok: false, error: "Unknown webhook" }, { status: 404 });
  }

  // Disconnected: the credentials are gone, so nothing below could be verified,
  // and a late session.status event must not flip the row back to PAUSED. 410
  // tells WAHA there is nothing to retry.
  if (connection.status === "DISCONNECTED") {
    return NextResponse.json({ ok: false, error: "Channel disconnected" }, { status: 410 });
  }

  // The RAW text, before any parsing: WAHA signs the exact bytes, and
  // re-serialising a parsed object changes key order and whitespace.
  const raw = await req.text();

  if (!whatsappWebhookAuthentic(connection, req.headers, raw)) {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
  }

  let event: WahaWebhookEvent | null = null;
  try {
    event = JSON.parse(raw) as WahaWebhookEvent;
  } catch {
    // Signed by us and still unparseable — acknowledge, because retrying the
    // same broken body forever helps nobody.
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  if (event?.event === "session.status") {
    const payload = event.payload as { status?: WahaSessionStatus } | null;
    const status = payload?.status;
    if (status) {
      // Pairing finished, the phone went offline, WhatsApp rejected us. This is
      // how the Channels card learns without anyone watching the dialog.
      await applySessionStatus(connection, status, (event.me ?? null) as WahaMeInfo | null);
    }
    return NextResponse.json({ ok: true, status: status ?? null });
  }

  const msg = whatsappAdapter.parseInbound(event);

  // Our own echo, a group, a status story, a media-only message, or an event
  // type we do not act on. Acknowledge so WAHA stops resending, and do nothing.
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
    console.warn(`[whatsapp] ${dispatch.reason} (message ${result.messageId})`);
  }

  return NextResponse.json({ ok: true, mode: dispatch.mode });
}

/** WAHA only ever POSTs; a GET here is a human checking the URL by hand. */
export async function GET() {
  return NextResponse.json({ ok: true, note: "WAHA WhatsApp webhook endpoint — POST only." });
}
