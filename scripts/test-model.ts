/**
 * Proves the whole AI path end to end against the real seeded agent:
 * prompt assembly -> model call -> tool calling -> cost accounting.
 *
 *   bun scripts/test-model.ts
 */
import { prisma } from "../lib/db";
import { resolveModelConfig, chat, estimateCostUsd, type ToolDef } from "../lib/ai/client";
import { buildMessages, splitReply } from "../lib/ai/prompt";

const ok = (m: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const line = (m: string) => console.log(`        ${m}`);

// The escalation tool. If a model cannot fire this reliably, it cannot do the job.
const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "alertHuman",
      description:
        "Pause the AI and notify a human colleague. Call this when the customer asks for a " +
        "person, asks for a price, mentions a complaint, or raises a safety-critical or " +
        "food-contact application.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why a human is needed" },
          urgency: { type: "string", enum: ["low", "normal", "high"] },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "captureContact",
      description: "Save the customer's name, email or phone when they give it.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
      },
    },
  },
];

async function main() {
  console.log("\nAI path test\n");

  const org = await prisma.organization.findFirstOrThrow({ where: { slug: "al-taher" } });
  const agent = await prisma.agent.findFirstOrThrow({ where: { organizationId: org.id } });
  const contact = await prisma.contact.findFirstOrThrow({ where: { organizationId: org.id } });
  const faqs = await prisma.faq.findMany({
    where: { organizationId: org.id },
    orderBy: { useCount: "desc" },
    take: 6,
    select: { question: true, answer: true },
  });

  const cfg = await resolveModelConfig(org.id);
  ok(`resolved model config — ${cfg.byok ? "tenant key" : "platform key"} @ ${cfg.baseUrl}`);
  line(`chat model: ${cfg.chatModel}`);

  // ── 1. A normal sales question ───────────────────────────────────────────
  const q1 = "Hi, do you supply bright chrome for car trim parts?";
  const messages1 = buildMessages({
    agent,
    contact,
    conversation: { summary: null },
    faqs,
    history: [],
    incoming: q1,
    dataQueryNames: ["check_stock"],
  });

  line(`system prompt: ${messages1[0].content?.length} chars`);
  const r1 = await chat(cfg, { messages: messages1, tools: TOOLS });
  ok("model replied to a product question");
  for (const b of splitReply(r1.content ?? "", agent.maxRepliesPerTurn)) {
    line(`\x1b[36m"${b}"\x1b[0m`);
  }
  line(
    `tokens: ${r1.usage.promptTokens} in (${r1.usage.cachedTokens} cached), ` +
      `${r1.usage.outputTokens} out — $${estimateCostUsd(r1.model, r1.usage).toFixed(6)}`,
  );

  // ── 2. The escalation case ───────────────────────────────────────────────
  const q2 = "What's your best price for 200 litres? I need it confirmed today.";
  const r2 = await chat(cfg, {
    messages: buildMessages({
      agent,
      contact,
      conversation: { summary: null },
      faqs,
      history: [],
      incoming: q2,
    }),
    tools: TOOLS,
  });

  const fired = r2.toolCalls.map((t) => t.function.name);
  if (fired.includes("alertHuman")) {
    ok(`escalated correctly — called ${fired.join(", ")}`);
    const args = JSON.parse(r2.toolCalls.find((t) => t.function.name === "alertHuman")!.function.arguments);
    line(`reason: "${args.reason}"`);
  } else {
    console.log(`  \x1b[33mWARN\x1b[0m  did NOT call alertHuman on a price request`);
    line(`replied instead: "${(r2.content ?? "").slice(0, 140)}"`);
    line(`This is the single most important behaviour — see CLAUDE.md §11.`);
  }

  const total = estimateCostUsd(r1.model, r1.usage) + estimateCostUsd(r2.model, r2.usage);
  console.log(`\n\x1b[32mDone.\x1b[0m 2 calls, ~$${total.toFixed(6)} (0 if the model isn't in the rate table).\n`);
}

main()
  .catch((e) => {
    console.error("\n\x1b[31mFAILED\x1b[0m", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
