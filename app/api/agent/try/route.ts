import { NextResponse } from "next/server";
import type { Contact } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { currentOrg } from "@/lib/tenant";
import { resolveModelConfig, type ChatMessage } from "@/lib/ai/client";
import { buildMessages, splitReply } from "@/lib/ai/prompt";
import { runToolLoop } from "@/lib/ai/agent";
import { getToolDefs } from "@/lib/ai/tools";

/**
 * The Try-it-out tab.
 *
 * The real prompt, the real model, the real tools — and NOTHING is written. No
 * conversation, no contact, no message, no UsageRecord. Someone testing an
 * agent's wording must not be able to escalate a live conversation or spend a
 * customer's contact record, and the transcript they produce is not history.
 *
 * The cost is still calculated and returned, because "what does a turn cost?"
 * is half of what the tab is for.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two shapes accepted: the chat-style one the UI naturally has, and the
// Message-shaped one anybody replaying a stored thread will reach for.
const HistoryItem = z.union([
  z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
  z.object({ direction: z.enum(["INBOUND", "OUTBOUND"]), body: z.string() }),
]);

const Body = z.object({
  agentId: z.string().min(1),
  message: z.string().trim().min(1, "message is required"),
  history: z.array(HistoryItem).max(40).optional(),
});

function toHistory(
  items: z.infer<typeof HistoryItem>[] | undefined,
): { direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: Date }[] {
  const now = Date.now();
  return (items ?? []).map((item, i) => ({
    direction: "role" in item ? (item.role === "user" ? "INBOUND" : "OUTBOUND") : item.direction,
    body: "role" in item ? item.content : item.body,
    // Order is what buildMessages needs; the actual times are irrelevant here.
    createdAt: new Date(now - (items!.length - i) * 1000),
  }));
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }

  const org = await currentOrg();
  const agent = await prisma.agent.findFirst({
    where: { id: parsed.data.agentId, organizationId: org.id },
  });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  // The sandbox writes no UsageRecord, so it cannot raise the day's spend — but
  // it must still respect it, or the playground becomes the way past the cap.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const spentToday = Number(
    (
      await prisma.usageRecord.aggregate({
        where: { organizationId: org.id, createdAt: { gte: since } },
        _sum: { costUsd: true },
      })
    )._sum.costUsd ?? 0,
  );
  const dailyCap = Math.min(Number(org.dailyCostCapUsd), env.MAX_COST_USD_PER_ORG_PER_DAY);
  if (spentToday >= dailyCap) {
    return NextResponse.json(
      { error: `Daily spend cap reached ($${dailyCap}). Try again tomorrow or raise the cap.` },
      { status: 429 },
    );
  }

  const faqs = await prisma.faq.findMany({
    where: { organizationId: org.id },
    orderBy: [{ isManual: "desc" }, { useCount: "desc" }, { id: "asc" }],
    take: 8,
    select: { question: true, answer: true },
  });

  // A contact that exists only for the length of this request.
  const sandboxContact: Contact = {
    id: "sandbox",
    organizationId: org.id,
    name: null,
    email: null,
    phone: null,
    locale: null,
    tags: [],
    notes: null,
    botExcluded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const messages: ChatMessage[] = buildMessages({
    agent,
    contact: sandboxContact,
    conversation: { summary: null },
    faqs,
    history: toHistory(parsed.data.history),
    incoming: parsed.data.message,
  });

  try {
    const cfg = await resolveModelConfig(org.id);
    const loop = await runToolLoop({
      cfg,
      messages,
      // dryRun is what makes the tools describe themselves instead of firing.
      ctx: { organizationId: org.id, dryRun: true },
      tools: getToolDefs(),
      model: agent.modelOverride ?? undefined,
      // No onResult: recordUsage would write a row, and this persists nothing.
      // runToolLoop falls back to estimateCostUsd.
    });

    return NextResponse.json({
      bubbles: loop.text ? splitReply(loop.text, agent.splitMessages ? agent.maxRepliesPerTurn : 1) : [],
      toolCalls: loop.toolCalls,
      usage: loop.usage,
      costUsd: loop.costUsd,
      model: loop.model,
      steps: loop.steps,
      stopped: loop.stopped,
    });
  } catch (err) {
    // The provider's own words. "Something went wrong" is how a rate limit gets
    // misdiagnosed as an outage.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
