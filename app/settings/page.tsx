import TopBar from "@/components/TopBar";
import SettingsForm from "@/components/settings/SettingsForm";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { currentOrg } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const org = await currentOrg();
  const usage = await prisma.usageRecord.aggregate({
    where: { organizationId: org.id },
    _sum: { costUsd: true, promptTokens: true, cachedTokens: true, outputTokens: true },
    _count: true,
  });

  const promptTokens = usage._sum.promptTokens ?? 0;
  const cachedTokens = usage._sum.cachedTokens ?? 0;
  const cacheRate = promptTokens ? Math.round((cachedTokens / promptTokens) * 100) : 0;
  // Presence only. The key itself is never decrypted for this page.
  const byok = Boolean(org.modelApiKeyEnc);

  return (
    <>
      <TopBar title="Settings" subtitle={org.name} />
      <div className="content">
        <section>
          <h2 className="sec">AI model</h2>
          <SettingsForm
            modelChat={org.modelChat ?? ""}
            modelUtility={org.modelUtility ?? ""}
            modelBaseUrl={org.modelBaseUrl ?? ""}
            dailyCostCapUsd={String(org.dailyCostCapUsd)}
            byok={byok}
            platformDefaults={{ chat: env.MODEL_CHAT, utility: env.MODEL_UTILITY }}
            platformCapUsd={env.MAX_COST_USD_PER_ORG_PER_DAY}
          />
        </section>

        <section>
          <h2 className="sec">Usage</h2>
          <div className="grid g4">
            <div className="stat">
              <div className="k">Model calls</div>
              <div className="v">{usage._count}</div>
            </div>
            <div className="stat">
              <div className="k">Spend</div>
              <div className="v">${Number(usage._sum.costUsd ?? 0).toFixed(4)}</div>
              <div className="d">{byok ? "on your own key" : "on the platform key"}</div>
            </div>
            <div className="stat">
              <div className="k">Cache hit rate</div>
              <div className="v" style={{ color: cacheRate > 70 ? "var(--ok)" : "var(--warn)" }}>
                {cacheRate}%
              </div>
              <div className="d">of input tokens</div>
            </div>
            <div className="stat">
              <div className="k">Output tokens</div>
              <div className="v">{(usage._sum.outputTokens ?? 0).toLocaleString()}</div>
            </div>
          </div>
          <p className="small dim" style={{ marginTop: 12 }}>
            Cache hit rate is the number worth watching. The instruction prefix is identical on
            every message, so it should sit high — if it falls, something is changing the prompt
            between calls and input cost rises roughly tenfold.
          </p>
        </section>

        <section>
          <h2 className="sec">Workspace</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td style={{ width: 200 }} className="dim">Name</td><td>{org.name}</td></tr>
                <tr><td className="dim">Slug</td><td className="mono">{org.slug}</td></tr>
                <tr><td className="dim">Timezone</td><td>{org.timezone}</td></tr>
                <tr><td className="dim">Created</td><td>{org.createdAt.toLocaleDateString("en-GB")}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
