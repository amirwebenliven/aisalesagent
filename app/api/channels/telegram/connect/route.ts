import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import { connectTelegram } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connect a Telegram bot: paste the token from @BotFather, we validate it,
 * store it encrypted and register the webhook.
 *
 * The token is never echoed back, never logged, and never stored in plaintext —
 * it is full control of the customer's bot (CLAUDE.md §12).
 */

const Body = z.object({
  // BotFather format: <numeric id>:<35-char secret>. Catching a mistyped token
  // here gives a useful message instead of Telegram's "Unauthorized".
  botToken: z
    .string()
    .trim()
    .regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, "That doesn't look like a BotFather token (123456:ABC-...)"),
  agentId: z.string().cuid().optional(),
  displayName: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
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
    const { connection, username, webhookUrl } = await connectTelegram({
      organizationId: org.id,
      botToken: parsed.data.botToken,
      agentId: parsed.data.agentId ?? null,
      displayName: parsed.data.displayName,
    });

    return NextResponse.json({
      ok: true,
      connection: {
        id: connection.id,
        kind: connection.kind,
        displayName: connection.displayName,
        username,
        status: connection.status,
      },
      // Useful in the dashboard; it contains the webhook secret, so it is only
      // ever returned to the authenticated owner of this org.
      webhookUrl,
    });
  } catch (e) {
    // Telegram's own message — "Unauthorized", "bad webhook: HTTPS url must be
    // provided". Replacing these with "something went wrong" is how a five
    // minute fix becomes a day of guessing.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
