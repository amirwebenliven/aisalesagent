import TopBar from "@/components/TopBar";
import AutoRefresh from "@/components/ui/AutoRefresh";
import AddFaqForm from "@/components/knowledge/AddFaqForm";
import AddSourceForm from "@/components/knowledge/AddSourceForm";
import FaqCard, { type FaqView } from "@/components/knowledge/FaqCard";
import RefreshSourceButton from "@/components/knowledge/RefreshSourceButton";
import { prisma } from "@/lib/db";
import { currentOrg, timeAgo } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Knowledge() {
  const org = await currentOrg();

  const [sources, faqs] = await Promise.all([
    prisma.knowledgeSource.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } }),
    prisma.faq.findMany({ where: { organizationId: org.id }, orderBy: [{ isManual: "desc" }, { useCount: "desc" }] }),
  ]);

  // A crawl finishes in the background with nobody pressing anything, so poll
  // while one is running and stop the moment none is.
  const crawling = sources.some((s) => s.status === "PENDING" || s.status === "CRAWLING");

  const views: FaqView[] = faqs.map((f) => ({
    id: f.id,
    question: f.question,
    answer: f.answer,
    isManual: f.isManual,
    useCount: f.useCount,
    sourceUrl: f.sourceUrl,
  }));

  return (
    <>
      <AutoRefresh everyMs={3_000} active={crawling} />

      <TopBar
        title="Knowledge Base"
        subtitle="Everything your AI draws answers from"
        right={
          <a className="btn primary" href="#add-source">
            Add source
          </a>
        }
      />
      <div className="content">
        <section>
          <div className="card card-p" style={{ borderLeft: "3px solid var(--info)" }}>
            <h2 className="sec">This is a snapshot, not a live link</h2>
            <p className="small dim">
              The AI never visits the website when answering. Each source was crawled once and
              turned into the answers below. Change the website and the AI will not know until you
              press <strong>Refresh</strong>. Ingestion costs roughly one credit per page.
            </p>
          </div>
        </section>

        <section>
          <AddSourceForm />
        </section>

        <section>
          <h2 className="sec">Sources</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="num">Pages</th>
                  <th className="num">FAQs</th>
                  <th>Status</th>
                  <th className="num">Last crawled</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const busy = s.status === "PENDING" || s.status === "CRAWLING";
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}>
                        {s.url}
                        {s.errorMessage && (
                          <div className="small" style={{ color: "var(--warn)", marginTop: 4, fontWeight: 400 }}>
                            {s.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="num">{s.pageCount}</td>
                      <td className="num">{faqs.filter((f) => f.sourceId === s.id).length}</td>
                      <td>
                        <span className={`pill ${s.status === "READY" ? "ok" : s.status === "FAILED" ? "err" : "warn"}`}>
                          {busy && <span className="dot" />}
                          {s.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="num dim">{s.lastCrawledAt ? timeAgo(s.lastCrawledAt) : "never"}</td>
                      <td style={{ textAlign: "right" }}>
                        <RefreshSourceButton sourceId={s.id} busy={busy} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sources.length === 0 && <div className="empty">No sources yet.</div>}
        </section>

        <section>
          <h2 className="sec">
            Answers <span className="dim" style={{ fontWeight: 400 }}>({faqs.length})</span>
          </h2>
          <p className="small dim" style={{ marginBottom: 12 }}>
            Hand-written answers first, then the crawled ones ordered by how often the AI has
            actually used them — the top entries are the ones earning their place.
          </p>
          <div style={{ marginBottom: 12 }}>
            <AddFaqForm />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {views.map((f) => (
              <FaqCard key={f.id} faq={f} />
            ))}
          </div>
          {faqs.length === 0 && <div className="empty">No answers yet — add a source to generate them.</div>}
        </section>
      </div>
    </>
  );
}
