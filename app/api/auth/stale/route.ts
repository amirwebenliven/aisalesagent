import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, destroySession } from "@/lib/session";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clears a session whose organization no longer exists.
 *
 * Without this, a cookie left over from a deleted or deactivated workspace
 * (after `bun scripts/reset.ts`, or a workspace being closed) leaves the user
 * in limbo: middleware sees a valid signature and lets them in, every page
 * then fails to resolve an organization, and there is no way out because the
 * only control that clears the cookie lives in the sidebar they cannot render.
 *
 * GET is safe here precisely because it refuses to act on a LIVE session: it
 * re-checks the database first and only clears a cookie that is already
 * worthless. So it cannot be used as a drive-by logout the way a GET on
 * /api/auth/logout could.
 */
export async function GET() {
  const session = await getSession();
  const login = new URL("/login", env.APP_URL);

  if (!session) {
    return NextResponse.redirect(login, 303);
  }

  // The SAME test currentOrg() applies — membership, not just the organization.
  // Checking only that the org exists would bounce a revoked member straight
  // back to a page that redirects here again: an infinite loop instead of a
  // logout. Whatever makes currentOrg() give up has to end the session here.
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      organizationId: session.organizationId,
      organization: { isActive: true },
    },
    select: { id: true },
  });

  if (membership) {
    // The session is fine — somebody hit this URL directly. Send them home
    // rather than signing them out.
    return NextResponse.redirect(new URL("/", env.APP_URL), 303);
  }

  await destroySession();
  login.searchParams.set("reason", "workspace-gone");
  return NextResponse.redirect(login, 303);
}
