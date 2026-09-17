import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import { applySessionStatus, whatsappQrDataUrl, whatsappSessionState } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The pairing poll: GET /api/channels/whatsapp/status?id=<connectionId>
 *
 * Answers with WAHA's current session state and, while it is SCAN_QR_CODE, the
 * QR as a data URL. The image is PROXIED rather than linked: WAHA's QR endpoint
 * needs the API key, and putting that key in a browser would hand every visitor
 * control of every tenant's WhatsApp session.
 *
 * Polled roughly every two seconds by the pairing dialog, so it does the
 * minimum: one WAHA read, one QR fetch only while a code is wanted, and a row
 * update only when something actually changed.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing connection id" }, { status: 400 });
  }

  const org = await currentOrg();

  // Scoped by organizationId, never looked up by the id alone. The id comes
  // from a URL, and a URL is user input — this is the tenant boundary.
  const connection = await prisma.channelConnection.findFirst({
    where: { id, organizationId: org.id, kind: "WHATSAPP_QR" },
  });
  if (!connection) {
    return NextResponse.json({ ok: false, error: "Unknown connection" }, { status: 404 });
  }

  // A WhatsApp row that never went through connectWhatsApp — the seeded demo
  // channel is exactly this. There is no session to ask about, and a 502 saying
  // "no stored credentials" would read as a broken bridge rather than a channel
  // that was never paired.
  if (!connection.credentialsEnc) {
    return NextResponse.json({
      ok: true,
      status: "STOPPED",
      error: "This channel has never been paired. Start a pairing to create a session.",
      phoneNumber: connection.externalId,
      agentId: connection.agentId,
      warmupStartedAt: connection.warmupStartedAt?.toISOString() ?? null,
      dailySendCap: connection.dailySendCap,
    });
  }

  let session;
  try {
    session = await whatsappSessionState(connection);
  } catch (e) {
    // The container is down or unreachable. Report it in WAHA's own words and
    // leave the row alone: a network blip is not evidence the pairing failed.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  if (!session) {
    // The session is gone from WAHA — deleted there, or the container was
    // recreated with an empty volume. STOPPED is what the dialog understands,
    // and it offers pairing again.
    return NextResponse.json({
      ok: true,
      status: "STOPPED",
      error: "The WhatsApp session no longer exists. Pair again to create a new one.",
      phoneNumber: null,
      agentId: connection.agentId,
      warmupStartedAt: connection.warmupStartedAt?.toISOString() ?? null,
      dailySendCap: connection.dailySendCap,
    });
  }

  // Keep the row in step with reality. The webhook does this too; both paths
  // exist so neither is a single point of failure — on a laptop where WAHA
  // cannot reach us, this poll is the only one that works.
  const updated = await applySessionStatus(connection, session.status, session.me ?? null);

  // Only while a code is actually wanted. Asking for a QR from a WORKING
  // session is a 404 every two seconds for as long as the dialog is open.
  const qr = session.status === "SCAN_QR_CODE" ? await whatsappQrDataUrl(updated) : null;

  return NextResponse.json({
    ok: true,
    // WAHA's own state string, not a flattened one: a state we did not expect
    // is the one worth putting on screen.
    status: session.status,
    ...(qr ? { qr } : {}),
    // The paired number, or null while externalId is still the session name.
    phoneNumber: updated.externalId === updated.id ? null : updated.externalId,
    agentId: updated.agentId,
    warmupStartedAt: updated.warmupStartedAt?.toISOString() ?? null,
    dailySendCap: updated.dailySendCap,
  });
}
