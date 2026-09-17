/**
 * Replay the Al Taher customer enquiry through OUR agent and print OUR replies.
 *
 *   bun scripts/replay-demo.ts
 *
 * The homepage demo must show what THIS product says, not what DM Champ's agent
 * said on the boss's foundergrowth.ai account in August. Same customer turns,
 * same seeded knowledge, same food-contact rule — our model, our tool calls.
 * Paste the output into components/marketing/LiveDemo.tsx.
 */
import { prisma } from "../lib/db";
import { resolveModelConfig, chat, estimateCostUsd, type ChatMessage, type ToolDef } from "../lib/ai/client";
import { buildMessages, splitReply } from "../lib/ai/prompt";
import { getToolDefs } from "../lib/ai/tools";

const CUSTOMER_TURNS = [
  "What kind of service are you providing",
  "Elegant",
  "Yes yes",
  "I am looking for Chrome plating in utensils that normally we are using in cooking. Also we need to check plating for car accessories",
];

const org = await prisma.organization.findFirstOrThrow({ where: { slug: "al-taher" } });
const agent = await prisma.agent.findFirstOrThrow({ where: { organizationId: org.id } });
const contact = await prisma.contact.findFirstOrThrow({ where: { organizationId: org.id } });
const faqs = await prisma.faq.findMany({
  where: { organizationId: org.id },
  orderBy: { useCount: "desc" },
  take: 8,
  select: { question: true, answer: true },
});
const cfg = await resolveModelConfig(org.id);
const tools: ToolDef[] = getToolDefs();

console.log(`\nagent: ${agent.name} · model ${cfg.chatModel} · ${faqs.length} FAQs · ${tools.length} tools\n`);

// Accumulate the real back-and-forth so each reply sees the prior turns.
const history: { direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: Date }[] = [];
let totalCost = 0;

for (const text of CUSTOMER_TURNS) {
  console.log(`them │ ${text}`);

  const messages: ChatMessage[] = buildMessages({
    agent,
    contact,
    conversation: { summary: null },
    faqs,
    history,
    incoming: text,
  });

  const res = await chat(cfg, { messages, tools });
  totalCost += estimateCostUsd(res.model, res.usage);

  const toolNames = res.toolCalls.map((t) => t.function.name);
  const bubbles = splitReply(res.content ?? "", agent.maxRepliesPerTurn);

  for (const b of bubbles) console.log(`  AI │ ${b}`);
  if (toolNames.length) {
    for (const t of res.toolCalls) {
      console.log(`     ↳ tool ${t.function.name}(${t.function.arguments})`);
    }
  }
  console.log(`     · ${res.usage.promptTokens} in (${res.usage.cachedTokens} cached) / ${res.usage.outputTokens} out\n`);

  history.push({ direction: "INBOUND", body: text, createdAt: new Date() });
  for (const b of bubbles) history.push({ direction: "OUTBOUND", body: b, createdAt: new Date() });
}

console.log(`total ≈ $${totalCost.toFixed(6)} for ${CUSTOMER_TURNS.length} turns\n`);
await prisma.$disconnect();
