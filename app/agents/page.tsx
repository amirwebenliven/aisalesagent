import Link from "next/link";
import TopBar from "@/components/TopBar";
import AgentActiveToggle from "@/components/agents/AgentActiveToggle";
import NewAgentButton from "@/components/agents/NewAgentButton";
import { prisma } from "@/lib/db";
import { currentOrg, timeAgo } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Agents() {
  const org = await currentOrg();

  const agents = await prisma.agent.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "asc" },
    include: {
      channels: true,
      _count: { select: { conversations: true } },
    },
  });

  // AI replies PER AGENT. Two queries rather than one per agent: group the
  // messages by conversation, then fold them onto the conversation's agent.
  const [convos, sentByConversation] = await Promise.all([
    prisma.conversation.findMany({
      where: { organizationId: org.id },
      select: { id: true, agentId: true },
    }),
    prisma.message.groupBy({
      by: ["conversationId"],
      where: { organizationId: org.id, direction: "OUTBOUND", aiGenerated: true },
      _count: true,
    }),
  ]);

  const agentOf = new Map(convos.map((c) => [c.id, c.agentId]));
  const aiSent = new Map<string, number>();
  for (const row of sentByConversation) {
    const agentId = agentOf.get(row.conversationId);
    if (agentId) aiSent.set(agentId, (aiSent.get(agentId) ?? 0) + row._count);
  }

  return (
    <>
      <TopBar
        title="AI Agents"
        subtitle="Their instructions, knowledge, and how they reply"
        right={<NewAgentButton />}
      />
      <div className="content">
        <section>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Language</th>
                  <th>Model</th>
                  <th className="num">Channels</th>
                  <th className="num">Conversations</th>
                  <th className="num">AI replies</th>
                  <th>Status</th>
                  <th className="num">Edited</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/agents/${a.id}`} style={{ fontWeight: 600, color: "var(--accent)" }}>
                        {a.name}
                      </Link>
                    </td>
                    <td className="dim">{a.primaryLanguage.toUpperCase()}</td>
                    <td className="num dim">{a.modelOverride ?? org.modelChat ?? "default"}</td>
                    <td className="num">{a.channels.length}</td>
                    <td className="num">{a._count.conversations}</td>
                    <td className="num">{aiSent.get(a.id) ?? 0}</td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <AgentActiveToggle agentId={a.id} isActive={a.isActive} />
                      </span>
                    </td>
                    <td className="num dim">{timeAgo(a.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {agents.length === 0 && (
            <div className="empty">No agents yet — &ldquo;New agent&rdquo; creates one with starter instructions.</div>
          )}
        </section>

        <section className="card card-p">
          <h2 className="sec">Who answers new conversations</h2>
          <p className="small dim">
            {agents[0]
              ? `${agents[0].name} answers ${agents[0].channels.length} connected channel${agents[0].channels.length === 1 ? "" : "s"}. One agent can cover every channel — connect Instagram tomorrow and it is covered with no extra setup.`
              : "No agent is assigned to any channel yet."}
          </p>
        </section>
      </div>
    </>
  );
}
