import Link from "next/link";
import TopBar from "@/components/TopBar";
import AutoRefresh from "@/components/ui/AutoRefresh";
import ChatThread, { type ThreadMessage } from "@/components/chats/ChatThread";
import Composer from "@/components/chats/Composer";
import ConversationControls from "@/components/chats/ConversationControls";
import { prisma } from "@/lib/db";
import { currentOrg, timeAgo } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  WIDGET: "Web",
  TELEGRAM: "Telegram",
  WHATSAPP_QR: "WhatsApp",
  WHATSAPP_CLOUD: "WhatsApp",
  EMAIL: "Email",
  INSTAGRAM: "Instagram",
  MESSENGER: "Messenger",
};

export default async function Chats({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const org = await currentOrg();

  const conversations = await prisma.conversation.findMany({
    where: { organizationId: org.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      channel: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const activeId = id ?? conversations[0]?.id;
  const active = activeId
    ? await prisma.conversation.findFirst({
        where: { id: activeId, organizationId: org.id },
        include: {
          contact: true,
          channel: true,
          agent: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      })
    : null;

  // Formatted here, not in the client component: the browser would use the
  // visitor's timezone and React would report every stamp as a hydration
  // mismatch.
  const thread: ThreadMessage[] =
    active?.messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      mediaUrl: m.mediaUrl,
      stamp:
        m.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
        (m.aiGenerated ? " · AI" : m.direction === "OUTBOUND" ? " · you" : ""),
    })) ?? [];

  return (
    <>
      {/* A customer replying on Telegram changes this page with nobody touching it. */}
      <AutoRefresh everyMs={10_000} />

      <TopBar
        title="Chats"
        subtitle={`${conversations.length} conversations`}
        right={active ? <ConversationControls conversationId={active.id} state={active.state} /> : null}
      />

      <div className="inbox">
        <div className="convo-list">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/chats?id=${c.id}`}
              className="convo"
              data-active={c.id === activeId}
            >
              <div className="top">
                <span className="nm">{c.contact.name ?? c.contact.phone ?? "Unknown visitor"}</span>
                <span className="tm">{timeAgo(c.lastMessageAt)}</span>
              </div>
              <div className="pv">
                {c.messages[0]?.body || (c.messages[0]?.mediaUrl ? "📷 Photo" : "No messages yet")}
              </div>
              <div className="meta">
                <span className="pill mute">{CHANNEL_LABEL[c.channel.kind]}</span>
                {c.state === "HUMAN_ACTIVE" && <span className="pill warn">needs you</span>}
                {c.state === "CLOSED" && <span className="pill mute">closed</span>}
              </div>
            </Link>
          ))}
          {conversations.length === 0 && <div className="empty">No conversations yet.</div>}
        </div>

        {active ? (
          <div className="thread">
            <div className="thread-head">
              <div>
                <div style={{ fontWeight: 600 }}>
                  {active.contact.name ?? active.contact.phone ?? "Unknown visitor"}
                </div>
                <div className="small dim">
                  {CHANNEL_LABEL[active.channel.kind]} · {active.channel.displayName}
                  {active.agent ? ` · ${active.agent.name}` : ""}
                </div>
              </div>
              <div className="small dim mono">
                ${Number(active.totalCostUsd).toFixed(4)} spent
              </div>
            </div>

            {/* Remount per conversation so the first paint is already at the newest message. */}
            <ChatThread key={active.id} messages={thread} />

            <Composer conversationId={active.id} closed={active.state === "CLOSED"} />
          </div>
        ) : (
          <div className="empty">Select a conversation.</div>
        )}
      </div>
    </>
  );
}
