import type { KnowledgeSource } from "@prisma/client";
import { prisma } from "../db";
import { resolveModelConfig } from "../ai/client";
import { crawlSite, type CrawlResult } from "./crawl";
import { generateFaqs } from "./generate";

export * from "./crawl";
export * from "./generate";
export * from "./retrieve";

/**
 * crawl → generate → store, as one operation, because both routes need exactly
 * this and a half-applied version of it is what leaves a source stuck in
 * CRAWLING forever.
 *
 * Two properties worth keeping if you edit this:
 *  - It NEVER throws. It is also called without `await` (background ingest), and
 *    an unhandled rejection there takes the process down while the customer
 *    stares at a "crawling" pill. Failure is a returned status + errorMessage.
 *  - Existing FAQs are replaced only AFTER the new ones exist. A failed refresh
 *    must leave the tenant with the knowledge base they had, not an empty one.
 */

const MAX_FAQS_PER_SOURCE = 400;
/** Model calls are the slow part; 3 at a time is polite to a shared gateway. */
const GENERATE_CONCURRENCY = 3;

export interface IngestResult {
  sourceId: string;
  status: "READY" | "FAILED";
  pageCount: number;
  faqCount: number;
  discovery?: CrawlResult["discovery"];
  stoppedBy?: CrawlResult["stoppedBy"];
  /** Pages skipped by the crawler, plus pages whose FAQ generation failed. */
  skipped: { url: string; reason: string }[];
  error?: string;
}

export interface IngestOptions {
  organizationId: string;
  sourceId: string;
  url: string;
  maxPages?: number;
  maxDepth?: number;
  maxPairsPerPage?: number;
  maxCrawlMs?: number;
}

/**
 * Sources currently being ingested IN THIS PROCESS. A double-click on "Refresh"
 * would otherwise run two crawls that both delete and re-insert the same FAQs,
 * and pay the model twice for it. Deliberately in-memory: a CRAWLING row left
 * behind by a killed process must not block the retry forever.
 */
const inFlight = new Set<string>();

export function isIngesting(sourceId: string): boolean {
  return inFlight.has(sourceId);
}

export async function ingestSource(opts: IngestOptions): Promise<IngestResult> {
  const { organizationId, sourceId, url } = opts;
  const skipped: { url: string; reason: string }[] = [];

  if (inFlight.has(sourceId)) {
    // Returned, not written: writing FAILED here would clobber the status of the
    // run that is actually in progress.
    return {
      sourceId,
      status: "FAILED",
      pageCount: 0,
      faqCount: 0,
      skipped,
      error: "An ingest for this source is already running.",
    };
  }
  inFlight.add(sourceId);

  try {
    // updateMany, not update: the organizationId in the WHERE is what makes it
    // impossible to touch another tenant's source with a guessed id.
    await prisma.knowledgeSource.updateMany({
      where: { id: sourceId, organizationId },
      data: { status: "CRAWLING", errorMessage: null },
    });

    const crawl = await crawlSite(url, {
      maxPages: opts.maxPages ?? 40,
      maxDepth: opts.maxDepth ?? 2,
      maxMs: opts.maxCrawlMs ?? 60_000,
    });
    skipped.push(...crawl.skipped);

    if (!crawl.pages.length) {
      const why = crawl.skipped[0]?.reason ?? "no pages with enough readable text were found";
      return fail(organizationId, sourceId, `Crawled ${url} but got nothing usable — ${why}`, skipped);
    }

    // Resolved once for the whole ingest: it decrypts a BYOK key and hits the
    // database, and 40 pages would mean 40 of both.
    const cfg = await resolveModelConfig(organizationId);

    const rows: { question: string; answer: string; sourceUrl: string }[] = [];
    const failures: string[] = [];

    await pool(crawl.pages, GENERATE_CONCURRENCY, async (page) => {
      try {
        const faqs = await generateFaqs(page.text, page.url, organizationId, {
          cfg,
          maxPairs: opts.maxPairsPerPage ?? 6,
        });
        for (const f of faqs) rows.push({ ...f, sourceUrl: page.url });
      } catch (e) {
        // One page that the model choked on must not cost us the other 39.
        const reason = e instanceof Error ? e.message : String(e);
        failures.push(reason);
        skipped.push({ url: page.url, reason: `FAQ generation failed — ${reason}` });
      }
    });

    if (!rows.length) {
      const why = failures[0] ?? "the model found nothing a customer would ask about";
      return fail(
        organizationId,
        sourceId,
        `Crawled ${crawl.pages.length} page(s) but generated no FAQs — ${why}`,
        skipped,
      );
    }

    const capped = rows.slice(0, MAX_FAQS_PER_SOURCE);

    const faqCount = await prisma.$transaction(async (tx) => {
      // isManual: false — a hand-written FAQ someone attached to this source is
      // knowledge that was never on the website (CLAUDE.md §7). A refresh must
      // not delete it.
      await tx.faq.deleteMany({ where: { organizationId, sourceId, isManual: false } });
      await tx.faq.createMany({
        data: capped.map((r) => ({
          organizationId,
          sourceId,
          question: r.question,
          answer: r.answer,
          sourceUrl: r.sourceUrl,
        })),
      });
      return tx.faq.count({ where: { organizationId, sourceId } });
    });

    // READY with a note, rather than FAILED: the tenant did get knowledge, but
    // "23 FAQs from 40 pages" is only explicable if the reason is recorded.
    const note = failures.length
      ? `${failures.length} of ${crawl.pages.length} pages failed FAQ generation: ${failures[0]!.slice(0, 300)}`
      : null;

    await prisma.knowledgeSource.updateMany({
      where: { id: sourceId, organizationId },
      data: {
        status: "READY",
        pageCount: crawl.pages.length,
        faqCount,
        lastCrawledAt: new Date(),
        errorMessage: note,
      },
    });

    return {
      sourceId,
      status: "READY",
      pageCount: crawl.pages.length,
      faqCount,
      discovery: crawl.discovery,
      stoppedBy: crawl.stoppedBy,
      skipped,
    };
  } catch (e) {
    return fail(organizationId, sourceId, e instanceof Error ? e.message : String(e), skipped);
  } finally {
    inFlight.delete(sourceId);
  }
}

async function fail(
  organizationId: string,
  sourceId: string,
  message: string,
  skipped: IngestResult["skipped"],
): Promise<IngestResult> {
  // Best effort: if the database itself is what failed, there is nowhere left to
  // write the reason, and throwing here would replace a useful error with a
  // useless one.
  await prisma.knowledgeSource
    .updateMany({
      where: { id: sourceId, organizationId },
      data: { status: "FAILED", errorMessage: message.slice(0, 2000) },
    })
    .catch(() => {});

  return { sourceId, status: "FAILED", pageCount: 0, faqCount: 0, skipped, error: message };
}

/**
 * The source row a crawl request should run against. Every branch carries the
 * organizationId in its WHERE, which is what makes a guessed id from another
 * tenant impossible to reach — the route never passes an id to prisma directly.
 */
export type SourceHit = { kind: "created" | "reused" | "busy"; source: KnowledgeSource };
/** Only a refresh can miss — a crawl creates the row when it isn't there. */
export type SourceLookup = SourceHit | { kind: "missing"; source?: undefined };

export async function sourceForCrawl(organizationId: string, url: string): Promise<SourceHit> {
  // Re-use rather than duplicate: pressing "Add source" twice with the same URL
  // must not leave two rows fighting over the same FAQs.
  const existing = await prisma.knowledgeSource.findFirst({ where: { organizationId, url } });
  if (existing) {
    return { kind: isIngesting(existing.id) ? "busy" : "reused", source: existing };
  }

  const source = await prisma.knowledgeSource.create({
    data: { organizationId, url, status: "PENDING" },
  });
  return { kind: "created", source };
}

export async function sourceForRefresh(organizationId: string, sourceId: string): Promise<SourceLookup> {
  const source = await prisma.knowledgeSource.findFirst({ where: { id: sourceId, organizationId } });
  if (!source) return { kind: "missing" };
  return { kind: isIngesting(source.id) ? "busy" : "reused", source };
}

/** Bounded-concurrency map. Workers pull from a shared cursor; order is irrelevant here. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
