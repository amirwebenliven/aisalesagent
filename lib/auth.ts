import { compare, hash } from "bcryptjs";
import type { Prisma } from "@prisma/client";

// Passwords, email normalisation, workspace slugs and the login rate limiter.
// Cookie/JWT handling lives in lib/session.ts; tenant resolution in lib/tenant.ts.

const BCRYPT_ROUNDS = 10;

/**
 * The single source of truth for how an email is written to, and read from, the
 * database. The classic bug is lowercasing on signup and NOT on login, so a real
 * account answers "email not found" the first time someone types "Amir@x.com".
 * Every path — signup, login, invites — must go through this.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS);
}

/**
 * A user row can legitimately have no passwordHash (invited, or SSO-only later).
 * bcrypt.compare against null/"" would throw rather than return false, so guard
 * it here — an account with no password must never authenticate with one.
 */
export async function verifyPassword(plain: string, passwordHash: string | null): Promise<boolean> {
  if (!passwordHash) return false;
  return compare(plain, passwordHash);
}

/**
 * A real bcrypt hash of a value nobody knows, compared against when the email is
 * unknown. Without it the "no such user" path returns in ~0ms and the "wrong
 * password" path in ~80ms, which is a readable oracle for which accounts exist —
 * the exact thing the identical error message is there to hide.
 */
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8Bu0DcF4G5VqMEMlJHrDiSTUaMvIAy";

export async function burnPasswordTiming(plain: string): Promise<void> {
  await compare(plain, DUMMY_HASH);
}

// ── Workspace slugs ──────────────────────────────────────────────────────────

/**
 * Slug for the URL/identity of a workspace. Non-latin names ("मेरी दुकान") strip
 * to an empty string, which would violate the unique index as soon as a second
 * one signs up — hence the "workspace" floor, with uniqueSlug() adding the -2.
 */
export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || "workspace";
}

/**
 * Takes the TRANSACTION client, not `prisma` — checked outside the transaction
 * the read would not see an org created a millisecond earlier by a parallel
 * signup. Even so the unique index is the real guarantee; the caller handles
 * P2002 for the two-signups-in-the-same-tick race.
 */
export async function uniqueSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await tx.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  // 49 workspaces called "acme" is not a naming collision, it is someone
  // scripting signups. Let the unique index reject it.
  return `${base}-${Date.now().toString(36)}`;
}

// ── Rate limiting ────────────────────────────────────────────────────────────
//
// In-memory and therefore PER PROCESS: two Next instances behind a load balancer
// each allow the full budget, and a deploy resets every counter. That is fine
// while we run one box; move it to Redis (INCR + EXPIRE on the same key) before
// we scale horizontally, or the limit becomes decorative.
//
// Sizing: 10 per 15 minutes is deliberately not tighter, because one IP is very
// often many people — an office NAT, or a mobile carrier's CGNAT pool where
// thousands of subscribers share an address. Login only counts FAILED attempts
// so a busy shared IP of people typing correct passwords never trips it.

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;
const MAX_BUCKETS = 10_000; // a scan from many IPs must not grow the Map forever

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function bucketFor(key: string, now: number): Bucket {
  const existing = buckets.get(key);
  if (existing && existing.resetAt > now) return existing;
  const fresh = { count: 0, resetAt: now + WINDOW_MS };
  buckets.set(key, fresh);
  return fresh;
}

function sweep(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

/** Read-only check — does not consume budget. */
export function rateLimitStatus(key: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = bucketFor(key, now);
  return {
    ok: b.count < MAX_ATTEMPTS,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

/** Consume one attempt. Call on failures (login) or on every attempt (signup). */
export function recordAttempt(key: string): void {
  const now = Date.now();
  const b = bucketFor(key, now);
  b.count += 1;
  sweep(now);
}

/** Clear a key — used after a successful signup so one person can't lock a shared IP. */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}

/**
 * Client IP behind Cloudflare/nginx. x-forwarded-for is a CLIENT-CONTROLLED
 * header appended to by each proxy, so the leftmost entry is spoofable — take
 * it anyway (we only rate-limit with it, never authorise), but take the FIRST
 * entry, not the last, or every request keys to our own load balancer and the
 * whole platform shares one bucket.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// ── Field validation ─────────────────────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 8;

/** Deliberately permissive: the only authority on whether an address exists is sending to it. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
