import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import { connectWhatsApp } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start (or restart) a WhatsApp QR pairing.
 *
 * Creates the WAHA session and returns immediately — pairing itself takes as
 * long as someone takes to find "Link a device" on their phone, so the QR and
 * the outcome are polled from /api/channels/whatsapp/status.
 *
 * Nothing secret crosses this boundary in either direction: the caller sends an
 * agent id, and gets back a connection id and a state string. The WAHA API key,
 * the HMAC key and the session's own credentials never leave the server
 * (CLAUDE.md §12).
 */

const Body = z.object({
  agentId: z.string().cuid().optional(),
  displayName: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  // An empty body is a valid request — "pair a number, no agent chosen yet".
  const parsed = Body.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const org = await currentOrg();

  // An agent from another tenant would answer this channel's customers.
  if (parsed.data.agentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: parsed.data.agentId, organizationId: org.id },
      select: { id: true },
    });
    if (!agent) {
      return NextResponse.json({ ok: false, error: "Unknown agent" }, { status: 404 });
    }
  }

  try {
    const { connection, status } = await connectWhatsApp({
      organizationId: org.id,
      agentId: parsed.data.agentId ?? null,
      displayName: parsed.data.displayName,
    });

    return NextResponse.json({
      ok: true,
      // The id the status poll is keyed on. The UI reads exactly this field.
      connectionId: connection.id,
      status,
      agentId: connection.agentId,
      // Already set at this point: the warm-up clock starts when the session is
      // created, not when the first message is sent.
      warmupStartedAt: connection.warmupStartedAt?.toISOString() ?? null,
      dailySendCap: connection.dailySendCap,
      // A number is only known once a phone has scanned; until then this is the
      // session name and the UI shows "not paired".
      phoneNumber: connection.externalId === connection.id ? null : connection.externalId,
    });
  } catch (e) {
    // WAHA's own words — "Cannot reach the WhatsApp bridge at http://localhost:3001",
    // "session already exists". A stopped container and a rejected pairing are
    // different problems and must not read the same.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
