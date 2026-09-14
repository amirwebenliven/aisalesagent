import Link from "next/link";
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import AgentActiveToggle from "@/components/agents/AgentActiveToggle";
import AgentInstructionsForm, { type AgentFormValues } from "@/components/agents/AgentInstructionsForm";
import TryOut from "@/components/agents/TryOut";
import { prisma } from "@/lib/db";
import { getToolDefs } from "@/lib/ai/tools";
import { currentOrg } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const STEPS = [
  "Instructions",
  "Knowledge",
  "Abilities",
  "Live data",
  "Follow-ups",
  "Channels",
  "Try out",
];

export default async function AgentEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  const org = await currentOrg();

  const agent = await prisma.agent.findFirst({
    where: { id, organizationId: org.id },
    include: { channels: true },
  });
  if (!agent) notFound();

  const activeStep = Number(step ?? 0);
  const faqCount = await prisma.faq.count({ where: { organizationId: org.id } });
  const defaultModel = agent.modelOverride ?? org.modelChat ?? "workspace default";

  // The tool roster the sandbox and the live loop actually run with — read from
  // the registry rather than typed out here, so a tool that lands in lib/ai/tools
  // appears on this screen instead of quietly not existing.
  const tools = getToolDefs().map((t) => ({ name: t.function.name, description: t.function.description }));

  const values: AgentFormValues = {
    id: agent.id,
    name: agent.name,
    persona: agent.persona,
    goal: agent.goal,
    companyInfo: agent.companyInfo,
    rules: agent.rules,
    conversationFlow: agent.conversationFlow,
    alertHumanWhen: agent.alertHumanWhen,
    concludeWhen: agent.concludeWhen,
    extraContext: agent.extraContext ?? "",
    primaryLanguage: agent.primaryLanguage,
    modelOverride: agent.modelOverride ?? "",
    replyDelayMinMs: String(agent.replyDelayMinMs),
    replyDelayMaxMs: String(agent.replyDelayMaxMs),
    maxRepliesPerTurn: String(agent.maxRepliesPerTurn),
    splitMessages: agent.splitMessages,
  };

  return (
    <>
      <TopBar
        title={agent.name}
        subtitle={`${agent.channels.length} channel${agent.channels.length === 1 ? "" : "s"} · model ${defaultModel}`}
        right={<AgentActiveToggle agentId={agent.id} isActive={agent.isActive} />}
      />
      <div className="content">
        <div style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: 24, alignItems: "start" }}>
          <div className="steps">
            {STEPS.map((s, i) => (
              <Link key={s} href={`/agents/${agent.id}?step=${i}`} className="step" data-active={i === activeStep}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </Link>
            ))}
          </div>

          <div>
            {activeStep === 0 && <AgentInstructionsForm values={values} defaultModel={org.modelChat ?? "workspace default"} />}

            {activeStep === 1 && (
              <div className="card card-p">
                <h2 className="sec">Knowledge</h2>
                <p className="small dim">
                  This agent draws on <strong>{faqCount} FAQs</strong> from the organisation&rsquo;s
                  knowledge base. Manage them in{" "}
                  <Link href="/knowledge" style={{ color: "var(--accent)" }}>Knowledge Base</Link>.
                </p>
              </div>
            )}

            {activeStep === 2 && (
              <div className="card card-p">
                <h2 className="sec">Abilities</h2>
                <p className="small dim" style={{ marginBottom: 14 }}>
                  Tools the agent may call mid-conversation. The description is what the model reads
                  when deciding whether to call one — it is prompt, not documentation.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Tool</th><th>What the model is told</th><th>Status</th></tr></thead>
                    <tbody>
                      {tools.map((t) => (
                        <tr key={t.name}>
                          <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{t.name}</td>
                          <td className="dim small">{t.description}</td>
                          <td><span className="pill ok">enabled</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small dim" style={{ marginTop: 12 }}>
                  Try them on the <Link href={`/agents/${agent.id}?step=6`} style={{ color: "var(--accent)" }}>Try out</Link>{" "}
                  tab — there they describe what they would do instead of doing it.
                </p>
              </div>
            )}

            {activeStep === 3 && (
              <div className="card card-p">
                <h2 className="sec">Live data</h2>
                <p className="small dim">
                  Named, read-only queries against the business&rsquo;s own database. The model never
                  writes SQL — it can only call these by name with validated arguments. Not built yet;
                  the model, the API and the editor for these are the next phase.
                </p>
              </div>
            )}

            {activeStep === 4 && (
              <div className="card card-p">
                <h2 className="sec">Follow-ups</h2>
                <p className="small dim">
                  Automatic nudges when a conversation goes quiet. Each one costs a model call, so
                  the cadence matters — see CLAUDE.md §8. The <span className="mono">scheduleFollowUp</span>{" "}
                  tool already queues them; the cadence editor is not built yet.
                </p>
              </div>
            )}

            {activeStep === 5 && (
              <div className="card card-p">
                <h2 className="sec">Channels</h2>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Channel</th><th>Identifier</th><th>Status</th></tr></thead>
                    <tbody>
                      {agent.channels.map((c) => (
                        <tr key={c.id}>
                          <td>{c.kind.replace(/_/g, " ").toLowerCase()}</td>
                          <td className="num dim">{c.displayName}</td>
                          <td><span className={`pill ${c.status === "ACTIVE" ? "ok" : c.status === "FAILED" ? "err" : "warn"}`}>{c.status.toLowerCase()}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {agent.channels.length === 0 && (
                  <p className="small dim" style={{ marginTop: 12 }}>
                    No channel points at this agent yet. Connect one in{" "}
                    <Link href="/channels" style={{ color: "var(--accent)" }}>Channels</Link>.
                  </p>
                )}
              </div>
            )}

            {activeStep === 6 && <TryOut agentId={agent.id} agentName={agent.name} tools={tools} />}
          </div>
        </div>
      </div>
    </>
  );
}
