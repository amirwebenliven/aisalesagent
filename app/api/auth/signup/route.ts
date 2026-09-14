import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import {
  MIN_PASSWORD_LENGTH,
  clearAttempts,
  clientIp,
  hashPassword,
  looksLikeEmail,
  normalizeEmail,
  rateLimitStatus,
  recordAttempt,
  slugify,
  uniqueSlug,
} from "@/lib/auth";

// bcrypt and Prisma are Node-only; an edge build of this route fails at runtime.
export const runtime = "nodejs";

type Fields = Record<string, string>;

const fail = (status: number, error: string, fields?: Fields) =>
  NextResponse.json({ error, fields: fields ?? {} }, { status });

export async function POST(req: Request) {
  const key = `signup:${clientIp(req)}`;
  const limit = rateLimitStatus(key);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many signup attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`, fields: {} },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }
  // Every signup attempt costs budget (a success creates an organization), unlike
  // login where only failures do.
  recordAttempt(key);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, "Malformed request body.");

  // Trim before every check: " " is truthy, so an untrimmed !value test happily
  // creates a workspace named one space that nobody can find again.
  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const businessName = String(body.businessName ?? "").trim();
  const name = String(body.name ?? "").trim();

  const fields: Fields = {};
  if (!email) fields.email = "Email is required.";
  else if (!looksLikeEmail(email)) fields.email = "That does not look like an email address.";
  if (!password) fields.password = "Password is required.";
  else if (password.length < MIN_PASSWORD_LENGTH)
    fields.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!businessName) fields.businessName = "Business name is required.";
  else if (businessName.length < 2) fields.businessName = "Use at least 2 characters.";

  if (Object.keys(fields).length > 0) return fail(400, "Check the highlighted fields.", fields);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return fail(409, "That email already has an account.", {
      email: "An account with this email already exists — log in instead.",
    });
  }

  const passwordHash = await hashPassword(password);

  try {
    // One transaction: a User with no Organization, or an Organization with no
    // OWNER, is an account nobody can use and nobody can clean up.
    const { userId, organizationId } = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: businessName, slug: await uniqueSlug(tx, slugify(businessName)) },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: { email, name: name || null, passwordHash },
        select: { id: true },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId: org.id, role: "OWNER" },
      });
      return { userId: user.id, organizationId: org.id };
    });

    await createSession(userId, organizationId);
    clearAttempts(key); // don't let one successful signup eat a shared office IP's budget
    return NextResponse.json({ ok: true, organizationId });
  } catch (e) {
    // P2002 = unique violation. Two signups in the same tick can pass the checks
    // above and still collide on user.email or organization.slug — the index is
    // the real guarantee, so translate it instead of returning a 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String((e.meta as { target?: string[] } | undefined)?.target ?? "");
      if (target.includes("email")) {
        return fail(409, "That email already has an account.", {
          email: "An account with this email already exists — log in instead.",
        });
      }
      return fail(409, "That workspace name was just taken. Try a slightly different one.", {
        businessName: "Already taken — add a word to make it unique.",
      });
    }
    throw e;
  }
}
