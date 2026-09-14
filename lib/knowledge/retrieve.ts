import { Prisma } from "@prisma/client";
import { prisma } from "../db";

/**
 * FAQ retrieval — PostgreSQL full-text search, no embeddings.
 *
 * pgvector is NOT installed, and for a knowledge base of a few hundred Q&A pairs
 * per tenant it would not earn its migration: `to_tsvector` over question+answer
 * ranks short, keyword-dense text well, costs nothing per query, and needs no
 * embedding call on the inbound message (which would be a second model call in
 * the hot path of every single reply).
 *
 * ORDER IS PART OF THE CONTRACT. lib/ai/prompt.ts puts these FAQs in section 2,
 * which is inside the cached prompt PREFIX. If the same query returns the same
 * FAQs in a different order between two turns of one conversation, the prefix
 * changes byte-for-byte, every cache read becomes a fresh read, and input cost
 * jumps ~10x with nothing visibly broken. Hence: every ORDER BY below ends in a
 * total tie-break on `id`, and nothing in the ordering depends on Postgres scan
 * order or on `random()`-flavoured scoring.
 */

export interface RetrievedFaq {
  id: string;
  question: string;
  answer: string;
  sourceUrl: string | null;
  isManual: boolean;
  score: number;
}

/**
 * Hand-written FAQs outrank crawled ones AT EQUAL RELEVANCE (CLAUDE.md §7):
 * pricing rules, lead times, "we don't ship there" — the things that were never
 * on the website. A multiplier, not a hard sort: a manual FAQ about refunds must
 * not displace the crawled one that actually answers "what are your hours?".
 */
const MANUAL_BOOST = 1.5;

export async function retrieveFaqs(
  organizationId: string,
  query: string,
  k = 6,
): Promise<RetrievedFaq[]> {
  const limit = Math.max(1, Math.min(k, 50));
  const q = query.trim();
  if (!q) return [];

  // Note the seq scan: to_tsvector is computed per row because a functional GIN
  // index needs a migration we don't own. At a few hundred FAQs per tenant this
  // is sub-millisecond; add the index when a tenant passes ~10k.
  const ranked = await prisma.$queryRaw<RetrievedFaq[]>`
    SELECT id, question, answer, "sourceUrl", "isManual",
           (ts_rank(tsv, tsq) * CASE WHEN "isManual" THEN ${MANUAL_BOOST}::float8 ELSE 1::float8 END)::float8
             AS score
    FROM (
      SELECT f.id, f.question, f.answer, f."sourceUrl", f."isManual",
             to_tsvector('english', f.question || ' ' || f.answer) AS tsv,
             plainto_tsquery('english', ${q}) AS tsq
      FROM "Faq" f
      WHERE f."organizationId" = ${organizationId}
    ) scored
    WHERE tsv @@ tsq
    ORDER BY score DESC, "isManual" DESC, id ASC
    LIMIT ${limit}
  `;

  if (ranked.length) return ranked;

  // plainto_tsquery ANDs its terms and stems them, so a real question that
  // shares only one word with an FAQ ("do you deliver to Sharjah?" vs an FAQ
  // about delivery) matches nothing at all. Word overlap catches those.
  return retrieveByOverlap(organizationId, q, limit);
}

async function retrieveByOverlap(
  organizationId: string,
  query: string,
  limit: number,
): Promise<RetrievedFaq[]> {
  // Strip everything non-alphanumeric: it drops ILIKE's own `%` and `_`
  // wildcards along with the punctuation, so no escaping is needed below.
  const words = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 12);

  if (!words.length) return [];

  // A hit in the question counts double — it is what the customer is asking.
  const parts = words.map(
    (w) => Prisma.sql`
      (CASE WHEN question ILIKE ${`%${w}%`} THEN 2 ELSE 0 END) +
      (CASE WHEN answer   ILIKE ${`%${w}%`} THEN 1 ELSE 0 END)`,
  );
  const overlap = Prisma.join(parts, " + ");

  return prisma.$queryRaw<RetrievedFaq[]>`
    SELECT id, question, answer, "sourceUrl", "isManual", score
    FROM (
      SELECT f.id, f.question, f.answer, f."sourceUrl", f."isManual",
             ((${overlap})::float8 * CASE WHEN f."isManual" THEN ${MANUAL_BOOST}::float8 ELSE 1::float8 END)
               AS score
      FROM "Faq" f
      WHERE f."organizationId" = ${organizationId}
    ) scored
    WHERE score > 0
    ORDER BY score DESC, "isManual" DESC, id ASC
    LIMIT ${limit}
  `;
}

/**
 * Call this once a retrieved FAQ has actually gone into a prompt — the knowledge
 * page ranks by useCount, which is how a customer sees which answers earn their
 * place. Kept out of retrieveFaqs itself so a dashboard preview or an eval run
 * doesn't inflate the numbers.
 */
export async function markFaqsUsed(organizationId: string, faqIds: string[]): Promise<void> {
  if (!faqIds.length) return;
  await prisma.faq.updateMany({
    where: { organizationId, id: { in: faqIds } },
    data: { useCount: { increment: 1 } },
  });
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "you", "your", "our", "can", "with", "what", "when", "where",
  "how", "does", "did", "have", "has", "was", "were", "this", "that", "there", "them", "they",
  "from", "about", "into", "any", "all", "would", "could", "should", "will", "been", "but",
  "not", "please", "hello", "thanks", "thank",
]);
