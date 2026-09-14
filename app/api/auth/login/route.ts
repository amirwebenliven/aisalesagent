import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import {
  burnPasswordTiming,
  clientIp,
  normalizeEmail,
  rateLimitStatus,
  recordAttempt,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

// One message for "no such account" and for "wrong password". Telling them apart
// turns the login box into an account-enumeration API — worth far more to an
// attacker than it is convenient to a customer. The distinction is logged.
const GENERIC = "Email or password is incorrect.";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const key = `login:${ip}`;
  const limit = rateLimitStatus(key);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`, fields: {} },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Malformed request body.", fields: {} }, { status: 400 });

  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  const fields: Record<string, string> = {};
  if (!email) fields.email = "Email is required.";
  if (!password) fields.password = "Password is required.";
  if (Object.keys(fields).length > 0) {
    return NextResponse.json({ error: "Check the highlighted fields.", fields }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    await burnPasswordTiming(password); // keep this path as slow as a real compare
    recordAttempt(key);
    console.warn(`[auth] login failed: no user for ${email} (ip ${ip})`);
    return NextResponse.json({ error: GENERIC, fields: {} }, { status: 401 });
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    recordAttempt(key);
    console.warn(`[auth] login failed: bad password for ${email} (ip ${ip})`);
    return NextResponse.json({ error: GENERIC, fields: {} }, { status: 401 });
  }

  // Which workspace they land in. Multi-workspace switching comes later; until
  // then the oldest membership is the one they created at signup.
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, organization: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  if (!membership) {
    // A real, correct password with nowhere to go — say so rather than reusing
    // GENERIC, which would send them round the password-reset loop forever.
    console.warn(`[auth] ${email} authenticated but has no active organization`);
    return NextResponse.json(
      { error: "Your account is not attached to an active workspace. Contact support.", fields: {} },
      { status: 403 },
    );
  }

  await createSession(user.id, membership.organizationId);
  return NextResponse.json({ ok: true });
}
