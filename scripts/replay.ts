/**
 * Replay a customer conversation through a tenant's agent and print what OUR
 * agent would say — replies, tool calls, photos, tokens, cost.
 *
 *   bun scripts/replay.ts <org-name-substring> <turns.txt>
 *
 * turns.txt holds one customer message per line; blank lines are skipped. The
 * org is matched by a case-insensitive substring of its name, and the first
 * ACTIVE agent on it answers.
 *
 * READ-ONLY. Nothing is written to the database: the tools run with dryRun (they
 * validate and describe instead of firing), no Message, Conversation, Contact or
 * UsageRecord row is created, and FAQ useCount is not bumped — that happens in
 * the live turn's settleSpend, which this never calls. The only cost is the
 * model calls themselves, which are billed to whatever key the org resolves to.
 *
 * Same code as the live path, on purpose: buildRetrievalQuery and
 * retrieveFaqsForTurn come from lib/ai/agent.ts, so the FAQs printed here are
 * the FAQs a real turn would have seen. This is how "the agent could not find
 * the saree's price" gets reproduced before it gets fixed — replay the
 * transcript from the chat export, read what retrieval put in front of the
 * model, change the code, replay again.
 *
 * Unlike scripts/replay-demo.ts this goes through runToolLoop, so a turn that
 * calls a tool and then rewrites its reply is shown the way the customer would
 * have received it, not as the first draft.
 */
import { readFileSync } from "node:fs";
import type { Contact } from "@prisma/client";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { resolveModelConfig } from "../lib/ai/client";
import { buildMessages, splitReply } from "../lib/ai/prompt";
import { buildRetrievalQuery, retrieveFaqsForTurn, runToolLoop } from "../lib/ai/agent";
import { getToolDefs, type ToolContext } from "../lib/ai/tools";

const [orgNeedle, turnsPath] = process.argv.slice(2);
if (!orgNeedle || !turnsPath) {
  console.error("usage: bun scripts/replay.ts <org-name-substring> <turns.txt>");
  process.exit(2);
}

const turns = readFileSync(turnsPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);
if (!turns.length) {
  console.error(`${turnsPath} has no customer turns (one per line).`);
  process.exit(2);
}

// Substring match, and refuse an ambiguous one rather than picking the first —
// "izhaana" and "izhaana test" are different tenants with different knowledge.
const orgs = await prisma.organization.findMany({
  where: { name: { contains: orgNeedle, mode: "insensitive" } },
  select: { id: true, name: true, slug: true },
  orderBy: { createdAt: "asc" },
});
if (orgs.length !== 1) {
  console.error(
    orgs.length
      ? `"${orgNeedle}" matches ${orgs.length} organisations — be more specific:\n` +
          orgs.map((o) => `  ${o.name} (${o.slug})`).join("\n")
      : `No organisation name contains "${orgNeedle}".`,
  );
  await prisma.$disconnect();
  process.exit(2);
}
const org = orgs[0]!;

const agent = await prisma.agent.findFirst({
  where: { organizationId: org.id, isActive: true },
  orderBy: { createdAt: "asc" },
});
if (!agent) {
  console.error(`${org.name} has no active agent.`);
  await prisma.$disconnect();
  process.exit(2);
}

// The live path and the try-it-out tab both refuse to run once the org is at
// its daily spend cap; a replay bills the same key (BYOK or platform) and writes
// no UsageRecord, so without this check it would be the one way past the cap
// and the overage would be invisible in the dashboard. --force overrides it for
// an operator who knows.
const since = new Date();
since.setUTCHours(0, 0, 0, 0);
const [orgRow, spent] = await Promise.all([
  prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { dailyCostCapUsd: true } }),
  prisma.usageRecord.aggregate({ where: { organizationId: org.id, createdAt: { gte: since } }, _sum: { costUsd: true } }),
]);
const dailyCap = Math.min(Number(orgRow.dailyCostCapUsd), env.MAX_COST_USD_PER_ORG_PER_DAY);
const spentToday = Number(spent._sum.costUsd ?? 0);
if (spentToday >= dailyCap && !process.argv.includes("--force")) {
  console.error(
    `${org.name} has spent $${spentToday.toFixed(4)} today, at or over its $${dailyCap} daily cap — ` +
      `a replay would bill past it. Pass --force to run anyway.`,
  );
  await prisma.$disconnect();
  process.exit(2);
}

const cfg = await resolveModelConfig(org.id);
const tools = getToolDefs();

// A contact that exists only for this run — the same shape the try-it-out
// sandbox uses. Nothing is looked up or saved against it.
const contact: Contact = {
  id: "replay",
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

console.log(
  `\norg: ${org.name} · agent: ${agent.name} · model ${agent.modelOverride ?? cfg.chatModel}` +
    ` · ${tools.length} tools · ${turns.length} turns · dryRun (nothing written)\n`,
);

// Accumulate the real back-and-forth so each reply — and each retrieval — sees
// the prior turns, exactly as runAgentTurn's history does.
const history: { direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: Date }[] = [];
let totalCost = 0;

for (const text of turns) {
  console.log(`them │ ${text}`);

  // The exact retrieval the live turn runs. The context query is printed so a
  // wrong FAQ set can be traced to the words that produced it.
  const faqs = await retrieveFaqsForTurn(org.id, text, history, 8);
  const query = buildRetrievalQuery(text, history);
  console.log(`     · context query: ${query.length > 120 ? `${query.slice(0, 117)}…` : query || "(none)"}`);
  for (const f of faqs) {
    const flags = [f.isManual && "manual", f.imageUrl && "image", f.sourceUrl && "link"]
      .filter(Boolean)
      .join(",");
    console.log(`     · faq ${f.score.toFixed(2)} ${flags ? `[${flags}] ` : ""}${f.question}`);
  }

  const messages = buildMessages({
    agent,
    contact,
    conversation: { summary: null },
    faqs,
    history,
    incoming: text,
  });

  // dryRun: every tool validates and describes, none writes. attachments is
  // in-memory — it is where sendImage queues photos, and how they are printed.
  const ctx: ToolContext = { organizationId: org.id, dryRun: true, attachments: [] };
  const loop = await runToolLoop({
    cfg,
    messages,
    ctx,
    tools,
    model: agent.modelOverride ?? undefined,
    // No onResult: recordUsage would write a UsageRecord. The default estimate
    // is what the try-it-out tab reports too.
  });
  totalCost += loop.costUsd;

  const bubbles = loop.text
    ? splitReply(loop.text, agent.splitMessages ? agent.maxRepliesPerTurn : 1)
    : [];
  const attachments = ctx.attachments ?? [];

  for (const b of bubbles) console.log(`  AI │ ${b}`);
  for (const a of attachments) console.log(`  AI │ [photo] ${a.url}${a.caption ? ` — "${a.caption}"` : ""}`);
  if (!bubbles.length && !attachments.length) console.log(`  AI │ (no reply — ${loop.stopped})`);

  for (const t of loop.toolCalls) {
    console.log(`     ↳ tool ${t.name}(${JSON.stringify(t.args)})`);
    console.log(`       → ${t.result}`);
  }
  console.log(
    `     · ${loop.steps} step(s) · ${loop.usage.promptTokens} in (${loop.usage.cachedTokens} cached)` +
      ` / ${loop.usage.outputTokens} out · $${loop.costUsd.toFixed(6)}${loop.stopped !== "complete" ? ` · ${loop.stopped}` : ""}\n`,
  );

  history.push({ direction: "INBOUND", body: text, createdAt: new Date() });
  for (const b of bubbles) history.push({ direction: "OUTBOUND", body: b, createdAt: new Date() });
  for (const a of attachments) {
    history.push({ direction: "OUTBOUND", body: a.caption ?? "", createdAt: new Date() });
  }
}

console.log(`total ≈ $${totalCost.toFixed(6)} for ${turns.length} turns\n`);
await prisma.$disconnect();
