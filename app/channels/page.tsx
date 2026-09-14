import type { ChannelKind } from "@prisma/client";
import TopBar from "@/components/TopBar";
import ChannelControls from "@/components/channels/ChannelControls";
import TelegramConnect from "@/components/channels/TelegramConnect";
import WidgetConnect from "@/components/channels/WidgetConnect";
import { prisma } from "@/lib/db";
import { widgetEmbedSnippet } from "@/lib/channels";
import { currentOrg } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// Effort and approval reality per channel — the thing that actually decides
// what we can sell and when. See CLAUDE.md §4 and §9.
//
// `built` is the honest column: a channel with no adapter gets no button, and
// says so, rather than a Connect that quietly does nothing.
const CATALOGUE: {
  kind: ChannelKind;
  name: string;
  blurb: string;
  approval: string;
  effort: string;
  caution: string | null;
  built: boolean;
  blocker?: string;
}[] = [
  {
    kind: "WHATSAPP_QR",
    name: "WhatsApp (QR pairing)",
    blurb: "Scan a QR with the phone's WhatsApp. No Meta approval.",
    approval: "None",
    effort: "2 minutes",
    caution: "Unofficial protocol — numbers can be banned. Disclose to the client.",
    built: false,
    blocker: "Needs a running WAHA instance (WAHA_URL); the adapter is not written yet.",
  },
  {
    kind: "WIDGET",
    name: "Website chat widget",
    blurb: "Embed a chat bubble on any site.",
    approval: "None",
    effort: "10 minutes",
    caution: null,
    built: true,
  },
  {
    kind: "TELEGRAM",
    name: "Telegram",
    blurb: "Official Bot API.",
    approval: "None",
    effort: "1 day",
    caution: null,
    built: true,
  },
  {
    kind: "EMAIL",
    name: "Email",
    blurb: "Gmail, Outlook or IMAP mailbox.",
    approval: "None",
    effort: "Minutes",
    caution: null,
    built: false,
    blocker: "No IMAP/OAuth adapter yet.",
  },
  {
    kind: "WHATSAPP_CLOUD",
    name: "WhatsApp Business API",
    blurb: "Official numbers via Meta Cloud API.",
    approval: "Meta Business Verification",
    effort: "3–10 days",
    caution: null,
    built: false,
    blocker: "Blocked on Meta Business Verification for the client's number.",
  },
  {
    kind: "INSTAGRAM",
    name: "Instagram & Messenger",
    blurb: "DMs, comment-to-DM and Story replies.",
    approval: "Meta App Review",
    effort: "Weeks · rejections common",
    caution: "Needs Advanced Access to instagram_manage_messages.",
    built: false,
    blocker: "Blocked on Meta App Review.",
  },
];

export default async function Channels() {
  const org = await currentOrg();

  const [connected, agents] = await Promise.all([
    prisma.channelConnection.findMany({ where: { organizationId: org.id } }),
    prisma.agent.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const byKind = new Map(connected.map((c) => [c.kind, c]));

  return (
    <>
      <TopBar title="Channels" subtitle="Where your customers reach you" />
      <div className="content">
        <section className="grid g2">
          {CATALOGUE.map((ch) => {
            const live = byKind.get(ch.kind);
            return (
              <div className="card card-p" key={ch.kind}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: 13.5 }}>{ch.name}</strong>
                    <p className="small dim" style={{ marginTop: 3 }}>{ch.blurb}</p>
                  </div>
                  {live ? (
                    <span className={`pill ${live.status === "ACTIVE" ? "ok" : live.status === "FAILED" ? "err" : "warn"}`}>
                      <span className="dot" />
                      {live.status.toLowerCase()}
                    </span>
                  ) : (
                    <span className="pill mute">{ch.built ? "not connected" : "not built yet"}</span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
                  <div>
                    <div className="small dim mono lab">Approval</div>
                    <div className="small">{ch.approval}</div>
                  </div>
                  <div>
                    <div className="small dim mono lab">Setup time</div>
                    <div className="small">{ch.effort}</div>
                  </div>
                </div>

                {live?.externalId && (
                  <div className="small dim mono" style={{ marginTop: 12 }}>
                    {/* For Telegram the externalId IS the bot username — the thing
                        that proves the token reached the right bot. */}
                    {live.kind === "TELEGRAM" ? `@${live.externalId}` : live.displayName}
                  </div>
                )}

                {live?.warmupStartedAt && (
                  <p className="small" style={{ marginTop: 10, color: "var(--warn)" }}>
                    Warming up · {live.dailySendCap}/day cap · cold outreach disabled
                  </p>
                )}

                {live?.lastErrorMessage && (
                  <p className="small" style={{ marginTop: 10, color: "var(--warn)" }}>{live.lastErrorMessage}</p>
                )}

                {ch.caution && !live && (
                  <p className="small dim" style={{ marginTop: 10, fontStyle: "italic" }}>{ch.caution}</p>
                )}

                <div style={{ marginTop: 14 }}>
                  {!ch.built ? (
                    // No button at all. A disabled "Connect" still reads as "one
                    // day away"; the reason it cannot be pressed is the useful part.
                    <p className="small dim">{ch.blocker}</p>
                  ) : live ? (
                    <>
                      {live.kind === "WIDGET" && <WidgetConnect embed={widgetEmbedSnippet(live.webhookSecret)} />}
                      <ChannelControls
                        channelId={live.id}
                        status={live.status}
                        agentId={live.agentId}
                        agents={agents}
                      />
                    </>
                  ) : ch.kind === "TELEGRAM" ? (
                    <TelegramConnect agents={agents} />
                  ) : ch.kind === "WIDGET" ? (
                    <WidgetConnect embed={null} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}
