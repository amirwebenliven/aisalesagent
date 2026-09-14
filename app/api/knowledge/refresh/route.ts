import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentOrg, devFallbackAllowed } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { ingestSource, sourceForRefresh } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/knowledge/refresh  { sourceId }
 *
 * Re-crawls one source and REPLACES its generated FAQs. This is the action
 * behind "the knowledge base is a snapshot, not a live link" (CLAUDE.md §7) —
 * change the website and nothing reaches the AI until someone presses this.
 *
 * Hand-written FAQs attached to the source survive, and the old set is deleted
 * only once the new one has been generated, so a failed refresh leaves the
 * tenant with the knowledge base they already had (see ingestSource).
 */

const Body = z.object({
  sourceId: z.string().min(1),
  maxPages: z.number().int().min(1).max(200).optional(),
  maxDepth: z.number().int().min(0).max(4).optional(),
  maxPairsPerPage: z.number().int().min(1).max(15).optional(),
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

  if (!(await getSession()) && !devFallbackAllowed()) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const org = await currentOrg();
  // Scoped lookup: another tenant's id comes back as 404, never as their data.
  const found = await sourceForRefresh(org.id, parsed.data.sourceId);

  if (found.kind === "missing") {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }
  if (found.kind === "busy") {
    return NextResponse.json(
      { error: "A crawl of this source is already running.", sourceId: found.source.id, status: "CRAWLING" },
      { status: 409 },
    );
  }

  const source = found.source;
  const opts = {
    organizationId: org.id,
    sourceId: source.id,
    url: source.url,
    maxPages: parsed.data.maxPages,
    maxDepth: parsed.data.maxDepth,
    maxPairsPerPage: parsed.data.maxPairsPerPage,
  };

  if (parsed.data.wait) {
    const result = await ingestSource(opts);
    return NextResponse.json(result, { status: result.status === "FAILED" ? 502 : 200 });
  }

  after(async () => {
    const result = await ingestSource(opts);
    if (result.status === "FAILED") {
      console.error(`[knowledge] refresh ${source.url} failed: ${result.error}`);
    }
  });

  return NextResponse.json({ sourceId: source.id, url: source.url, status: "CRAWLING" }, { status: 202 });
}
