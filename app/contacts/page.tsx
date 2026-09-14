import TopBar from "@/components/TopBar";
import BotExcludeToggle from "@/components/contacts/BotExcludeToggle";
import { prisma } from "@/lib/db";
import { currentOrg, timeAgo } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  const org = await currentOrg();
  const contacts = await prisma.contact.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { conversations: true } } },
  });

  return (
    <>
      <TopBar title="Contacts" subtitle={`${contacts.length} people`} />
      <div className="content">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Tags</th>
                <th className="num">Chats</th>
                <th className="num">Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>
                    {c.name ?? <span className="dim">Unknown visitor</span>}
                  </td>
                  <td className="num dim">{c.phone ?? "—"}</td>
                  <td className="dim small">{c.email ?? "—"}</td>
                  <td>
                    <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {c.tags.map((t) => (
                        <span className="pill mute" key={t}>{t}</span>
                      ))}
                      {c.botExcluded && <span className="pill warn">AI muted</span>}
                    </span>
                  </td>
                  <td className="num">{c._count.conversations}</td>
                  <td className="num dim">{timeAgo(c.createdAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <BotExcludeToggle contactId={c.id} excluded={c.botExcluded} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {contacts.length === 0 && <div className="empty">No contacts yet.</div>}
      </div>
    </>
  );
}
