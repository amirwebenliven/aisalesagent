import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSession, type Session } from "./session";

/**
 * THE tenant boundary. Every page and query resolves its organization here
 * rather than reaching for prisma with an id from the URL — an id in a URL is
 * user input, and trusting one is how one client reads another's conversations.
 * The organizationId comes from the signed session cookie only.
 */

/**
 * Dev fallback: with no session we serve the first active organization so the
 * seeded demo renders without logging in. NEVER in production — there it would
 * hand an anonymous visitor the first tenant's inbox.
 */
export function devFallbackAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return process.env.ALLOW_DEV_FALLBACK === "1";
  return true;
}

export async function currentOrg() {
  const session = await getSession();

  if (session) {
    const org = await prisma.organization.findFirst({
      where: { id: session.organizationId, isActive: true },
    });
    if (org) return org;
    // Cookie points at an org that was deleted or deactivated. Fall through:
    // in production that throws below and middleware sends them to /login,
    // which issues a session that matches reality.
  }

  if (!devFallbackAllowed()) {
    throw new Error("No session. Sign in at /login.");
  }

  const org = await prisma.organization.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!org) throw new Error("No organization found. Run: bun prisma/seed.ts");
  return org;
}

/**
 * Email of the signed-in user. Keeps the organizationId argument that callers
 * already pass, because it is still the right answer for the dev fallback
 * (no session → whoever owns this workspace).
 */
export async function currentUserEmail(organizationId: string) {
  const session = await getSession();
  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });
    if (user) return user.email;
  }

  const m = await prisma.membership.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    include: { user: true },
  });
  return m?.user.email ?? "unknown@local";
}

/**
 * For anything that must be authenticated regardless of the dev fallback —
 * mutations, billing, anything org-scoped that writes. Redirects to /login
 * rather than returning null, so a caller cannot forget to handle the null.
 * Server Components and Route Handlers only (redirect() throws NEXT_REDIRECT).
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Credits shown in the sidebar: a notional balance minus recorded spend. */
export async function creditBalance(organizationId: string) {
  const agg = await prisma.usageRecord.aggregate({
    where: { organizationId },
    _sum: { costUsd: true },
  });
  const spentUsd = Number(agg._sum.costUsd ?? 0);
  const STARTING_CREDITS = 100;
  return Math.max(0, STARTING_CREDITS - spentUsd * 10); // 1 credit = $0.10
}

export function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
