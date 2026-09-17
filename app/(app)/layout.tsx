import Sidebar from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { currentOrg, currentUserEmail, creditBalance } from "@/lib/tenant";

/**
 * The signed-in shell: sidebar + main column. Every route in this group
 * (dashboard, chats, contacts, agents, knowledge, channels, settings) already
 * resolves its organization through currentOrg(), so doing it here adds no new
 * failure mode — if the session cannot resolve, the page beneath would have
 * failed identically. Middleware keeps logged-out visitors out of this group
 * before it ever renders; currentOrg() handles the one case middleware cannot
 * see (a validly signed cookie for a revoked membership) by redirecting to
 * /api/auth/stale.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const org = await currentOrg();
  const [email, credits, open] = await Promise.all([
    currentUserEmail(org.id),
    creditBalance(org.id),
    prisma.conversation.count({ where: { organizationId: org.id, state: { not: "CLOSED" } } }),
  ]);

  return (
    <div className="shell">
      <Sidebar orgName={org.name} userEmail={email} credits={credits} openChats={open} />
      <div className="main">{children}</div>
    </div>
  );
}
