import TopBar from "@/components/TopBar";
import { prisma } from "@/lib/db";
import { currentOrg, timeAgo } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  WIDGET: "Website widget",
  TELEGRAM: "Telegram",
  WHATSAPP_QR: "WhatsApp (QR)",
  WHATSAPP_CLOUD: "WhatsApp Business API",
  EMAIL: "Email",
  INSTAGRAM: "Instagram",
  MESSENGER: "Messenger",
};

const STATUS_PILL: Record<string, string> = {
  ACTIVE: "ok",
  CONNECTING: "warn",
  PAUSED: "warn",
  FAILED: "err",
};

export default async function Dashboard() {
  const org = await currentOrg();
  const since = new Date(Date.now() - 30 * 24 * 3600_000);

  const [sent, received, contacts, convos, aiSent, channels, usage, recent] = await Promise.all([
    prisma.message.count({ where: { organizationId: org.id, direction: "OUTBOUND", createdAt: { gte: since } } }),
    prisma.message.count({ where: { organizationId: org.id, direction: "INBOUND", createdAt: { gte: since } } }),
    prisma.contact.count({ where: { organizationId: org.id, createdAt: { gte: since } } }),
    prisma.conversation.count({ where: { organizationId: org.id } }),
    prisma.message.count({ where: { organizationId: org.id, direction: "OUTBOUND", aiGenerated: true, createdAt: { gte: since } } }),
    prisma.channelConnection.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
      include: { agent: { select: { name: true } } },
    }),
    prisma.usageRecord.findMany({
      where: { organizationId: org.id, createdAt: { gte: new Date(Date.now() - 14 * 24 * 3600_000) } },
      select: { createdAt: true, costUsd: true },
    }),
    prisma.conversation.findMany({
      where: { organizationId: org.id },
      orderBy: { lastMessageAt: "desc" },
      take: 6,
      include: {
        contact: true,
        channel: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  // 14-day spend, bucketed by day.
  const buckets = new Array(14).fill(0);
  for (const u of usage) {
    const d = Math.floor((Date.now() - u.createdAt.getTime()) / (24 * 3600_000));
    if (d >= 0 && d < 14) buckets[13 - d] += Number(u.costUsd);
  }
  const peak = Math.max(...buckets, 0.0001);
  const spend30 = usage.reduce((a, u) => a + Number(u.costUsd), 0);

  const aiShare = sent ? Math.round((aiSent / sent) * 100) : 0;
  const needsHuman = await prisma.conversation.count({
    where: { organizationId: org.id, state: "HUMAN_ACTIVE" },
  });

  return (
    <>
      <TopBar title="Dashboard" subtitle="Last 30 days" />
      <div className="content">
        <section>
          <div className="grid g4">
            <div className="stat">
              <div className="k">Messages sent</div>
              <div className="v">{sent}</div>
              <div className="d">{aiShare}% handled by AI</div>
            </div>
            <div className="stat">
              <div className="k">Received</div>
              <div className="v">{received}</div>
              <div className="d">across {channels.filter((c) => c.status === "ACTIVE").length} live channels</div>
            </div>
            <div className="stat">
              <div className="k">New contacts</div>
              <div className="v">{contacts}</div>
              <div className="d">{convos} conversations total</div>
            </div>
            <div className="stat">
              <div className="k">Needs a human</div>
              <div className="v" style={{ color: needsHuman ? "var(--warn)" : undefined }}>
                {needsHuman}
              </div>
              <div className="d">escalated by the AI</div>
            </div>
          </div>
        </section>

        <section className="grid g2">
          <div className="card card-p">
            <h2 className="sec">AI spend · last 14 days</h2>
            <div className="bars">
              {buckets.map((v, i) => (
                <div
                  key={i}
                  className="b"
                  style={{ height: `${Math.max(2, (v / peak) * 100)}%` }}
                  title={`$${v.toFixed(4)}`}
                />
              ))}
            </div>
            <div className="axis">
              <span>14d ago</span>
              <span>today</span>
            </div>
            <p className="small dim" style={{ marginTop: 12 }}>
              <span className="mono">${spend30.toFixed(4)}</span> total ·{" "}
              <span className="mono">
                ${convos ? (spend30 / convos).toFixed(4) : "0.0000"}
              </span>{" "}
              per conversation
            </p>
          </div>

          <div className="card card-p">
            <h2 className="sec">Who handled the replies</h2>
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "var(--surface-3)" }}>
              <div style={{ width: `${aiShare}%`, background: "var(--accent)" }} />
              <div style={{ width: `${100 - aiShare}%`, background: "var(--surface-3)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
              <div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{aiShare}%</div>
                <div className="small dim">AI</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{100 - aiShare}%</div>
                <div className="small dim">Your team</div>
              </div>
            </div>
            <p className="small dim" style={{ marginTop: 14 }}>
              A healthy number here is high but never 100% — the AI escalating is the feature
              working, not failing.
            </p>
          </div>
        </section>

        <section>
          <h2 className="sec">Channel health</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Identifier</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id}>
                    <td>{CHANNEL_LABEL[c.kind] ?? c.kind}</td>
                    <td className="num dim">{c.externalId ?? c.displayName}</td>
                    <td className="dim">{c.agent?.name ?? "—"}</td>
                    <td>
                      <span className={`pill ${STATUS_PILL[c.status] ?? "mute"}`}>
                        <span className="dot" />
                        {c.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="small dim">
                      {c.lastErrorMessage
                        ? c.lastErrorMessage
                        : c.warmupStartedAt
                          ? `Warm-up · cap ${c.dailySendCap}/day`
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="sec">Recent conversations</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Channel</th>
                  <th>Last message</th>
                  <th>State</th>
                  <th className="num">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>
                      {c.contact.name ?? c.contact.phone ?? "Unknown visitor"}
                    </td>
                    <td className="dim small">{CHANNEL_LABEL[c.channel.kind]}</td>
                    <td className="dim small" style={{ maxWidth: 380 }}>
                      {c.messages[0]?.body.slice(0, 90) ?? "—"}
                      {(c.messages[0]?.body.length ?? 0) > 90 ? "…" : ""}
                    </td>
                    <td>
                      <span className={`pill ${c.state === "HUMAN_ACTIVE" ? "warn" : c.state === "CLOSED" ? "mute" : "ok"}`}>
                        {c.state === "AI_ACTIVE" ? "AI active" : c.state === "HUMAN_ACTIVE" ? "human" : "closed"}
                      </span>
                    </td>
                    <td className="num dim">{timeAgo(c.lastMessageAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
