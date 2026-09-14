import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentOrg, devFallbackAllowed } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { assertCrawlableUrl, ingestSource, sourceForCrawl } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/knowledge/crawl  { url }
 *
 * Creates (or reuses) a KnowledgeSource and ingests it. The work runs in
 * `after()` — Redis is down, so there is no queue to hand it to, and a 40-page
 * crawl plus 40 model calls is minutes, not milliseconds. `after()` at least
 * keeps it off the response: the caller gets 202 + a sourceId and polls the
 * status pill. When the BullMQ worker lands this is the one call site to
 * change; everything else already reads status from the row.
 */

const Body = z.object({
  url: z.string().min(1),
  maxPages: z.number().int().min(1).max(200).optional(),
  maxDepth: z.number().int().min(0).max(4).optional(),
  maxPairsPerPage: z.number().int().min(1).max(15).optional(),
  /** Run inline and return the counts. For scripts and tests, not the UI. */
  wait: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }

  let url: string;
  try {
    url = assertCrawlableUrl(parsed.data.url).href;
  } catch (e) {
    // The tenant typed this; tell them exactly what was wrong with it.
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  // This is a write that spends the tenant's model budget, so it is gated on a
  // real session — but with 401 JSON rather than requireSession()'s redirect to
  // /login, which a fetch() from the dashboard would follow and then try to
  // parse an HTML page as JSON.
  if (!(await getSession()) && !devFallbackAllowed()) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Tenant scope comes from the session, NEVER from the body — an
  // organizationId parameter here would be a one-line cross-tenant write.
  const org = await currentOrg();
  const found = await sourceForCrawl(org.id, url);

  if (found.kind === "busy") {
    return NextResponse.json(
      { error: "A crawl of this URL is already running.", sourceId: found.source.id, status: "CRAWLING" },
      { status: 409 },
    );
  }

  const opts = {
    organizationId: org.id,
    sourceId: found.source.id,
    url,
    maxPages: parsed.data.maxPages,
    maxDepth: parsed.data.maxDepth,
    maxPairsPerPage: parsed.data.maxPairsPerPage,
  };

  if (parsed.data.wait) {
    const result = await ingestSource(opts);
    // 502: the failure is the customer's site or the model gateway, not us.
    return NextResponse.json(result, { status: result.status === "FAILED" ? 502 : 200 });
  }

  after(async () => {
    // ingestSource never throws — it records FAILED on the row instead, which is
    // the only place a background failure can still be seen.
    const result = await ingestSource(opts);
    if (result.status === "FAILED") console.error(`[knowledge] crawl ${url} failed: ${result.error}`);
  });

  return NextResponse.json(
    { sourceId: found.source.id, url, status: "CRAWLING", reused: found.kind === "reused" },
    { status: 202 },
  );
}
