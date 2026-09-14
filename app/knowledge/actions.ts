"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import { assertCrawlableUrl, ingestSource, sourceForCrawl, sourceForRefresh } from "@/lib/knowledge";
import type { ActionState } from "@/components/ui/action-state";

/**
 * Knowledge base mutations.
 *
 * A crawl is minutes, not milliseconds: 40 pages plus a model call each. It
 * runs in `after()` — the action returns as soon as the row exists in CRAWLING,
 * and the page polls the status pill. When the BullMQ worker is reachable this
 * is the call site to change; everything else already reads status from the row.
 */

function fieldText(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function addSource(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = fieldText(formData, "url");
  if (!raw) return { ok: false, error: "Paste the address of the site to crawl." };

  let url: string;
  try {
    // Refuses private hosts, non-http schemes and the like. The tenant typed
    // this, so its message is the useful one.
    url = assertCrawlableUrl(raw).href;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const org = await currentOrg();
  const found = await sourceForCrawl(org.id, url);
  if (found.kind === "busy") {
    return { ok: false, error: "A crawl of this URL is already running." };
  }

  const opts = { organizationId: org.id, sourceId: found.source.id, url };
  after(async () => {
    // ingestSource never throws — it writes FAILED and the reason onto the row,
    // which is the only place a background failure can still be seen.
    const result = await ingestSource(opts);
    if (result.status === "FAILED") console.error(`[knowledge] crawl ${url} failed: ${result.error}`);
  });

  revalidatePath("/knowledge");
  return {
    ok: true,
    message: found.kind === "reused" ? `Re-crawling ${url}…` : `Crawling ${url} — this takes a minute or two.`,
  };
}

export async function refreshSource(sourceId: string): Promise<ActionState> {
  const org = await currentOrg();
  const found = await sourceForRefresh(org.id, sourceId);

  if (found.kind === "missing") return { ok: false, error: "Source not found." };
  if (found.kind === "busy") return { ok: false, error: "A crawl of this source is already running." };

  const source = found.source;
  after(async () => {
    const result = await ingestSource({ organizationId: org.id, sourceId: source.id, url: source.url });
    if (result.status === "FAILED") console.error(`[knowledge] refresh ${source.url} failed: ${result.error}`);
  });

  revalidatePath("/knowledge");
  return { ok: true, message: `Re-crawling ${source.url}…` };
}

export async function addFaq(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const question = fieldText(formData, "question");
  const answer = fieldText(formData, "answer");
  if (!question) return { ok: false, error: "What is the question?" };
  if (!answer) return { ok: false, error: "What should the AI answer?" };

  const org = await currentOrg();
  await prisma.faq.create({
    data: {
      organizationId: org.id,
      question,
      answer,
      // Hand-written: outranks crawled answers at retrieval, and a refresh of
      // any source must never delete it.
      isManual: true,
    },
  });

  revalidatePath("/knowledge");
  return { ok: true, message: "Added. Hand-written answers outrank crawled ones." };
}

export async function updateFaq(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = fieldText(formData, "id");
  const question = fieldText(formData, "question");
  const answer = fieldText(formData, "answer");
  if (!id) return { ok: false, error: "Missing answer id." };
  if (!question || !answer) return { ok: false, error: "A question and an answer are both required." };

  const org = await currentOrg();
  const { count } = await prisma.faq.updateMany({
    where: { id, organizationId: org.id },
    // An edited answer is now the tenant's own words, not the crawler's — and
    // the next refresh of its source would otherwise delete the edit.
    data: { question, answer, isManual: true },
  });
  if (!count) return { ok: false, error: "Answer not found." };

  revalidatePath("/knowledge");
  return { ok: true, message: "Saved." };
}

export async function deleteFaq(id: string): Promise<ActionState> {
  const org = await currentOrg();
  const { count } = await prisma.faq.deleteMany({ where: { id, organizationId: org.id } });
  if (!count) return { ok: false, error: "Answer not found." };

  revalidatePath("/knowledge");
  return { ok: true, message: "Deleted." };
}
