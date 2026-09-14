import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Used by the deploy target's health check, and handy for `curl` during dev.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
