/**
 * What is actually set up right now, and what is stopping a message from being
 * answered. Run this first whenever "I sent a message and nothing happened".
 *
 *   bun scripts/status.ts
 */
import { prisma } from "../lib/db";
import { env } from "../lib/env";

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`);

const blockers: string[] = [];

console.log("\n── Workspace ──");
const orgs = await prisma.organization.findMany({
  include: {
    agents: true,
    channels: true,
    _count: { select: { contacts: true, conversations: true, faqs: true } },
  },
});

if (!orgs.length) {
  bad("No workspace yet.");
  blockers.push("Sign up at http://localhost:3000/signup");
}

for (const org of orgs) {
  console.log(`\n  ${org.name}  (${org.slug})`);
  console.log(`    contacts ${org._count.contacts} · conversations ${org._count.conversations} · FAQs ${org._count.faqs}`);

  // ── Agents ──
  if (!org.agents.length) {
    bad("No agent. Nothing can answer a message.");
    blockers.push("Create an agent: AI Agents → New agent");
  } else {
    for (const a of org.agents) {
      if (a.isActive) ok(`Agent "${a.name}" is active`);
      else {
        warn(`Agent "${a.name}" is PAUSED — it will not answer`);
        blockers.push(`Activate the agent "${a.name}" on its page (top right)`);
      }

      // A new agent ships with placeholder prose so it cannot answer as a real
      // business by accident. Left unedited it will introduce itself as "this
      // business" to a live customer, which is worse than saying nothing.
      const placeholders = [
        ["companyInfo", "Fill this in"],
        ["persona", "first responder for this business"],
      ] as const;
      const unedited = placeholders
        .filter(([field, needle]) => (a as unknown as Record<string, string>)[field]?.includes(needle))
        .map(([field]) => field);

      if (unedited.length) {
        warn(`Agent "${a.name}" still has starter text in: ${unedited.join(", ")}`);
        blockers.push(
          `Replace the starter text in "${a.name}" (${unedited.join(", ")}) — Agents → ${a.name} → Instructions`,
        );
      }
    }
  }

  // ── Knowledge ──
  if (org._count.faqs === 0) {
    warn("No FAQs — the agent will answer from its instructions only, not your website.");
    blockers.push("Add your website: Knowledge Base → Add source");
  } else {
    ok(`${org._count.faqs} FAQs available to the agent`);
  }

  // ── Channels ──
  if (!org.channels.length) {
    bad("No channel connected.");
    blockers.push("Connect Telegram: Channels → Telegram → Connect");
  }

  for (const c of org.channels) {
    const label = `${c.kind} ${c.externalId ? `@${c.externalId}` : ""}`.trim();

    if (c.status !== "ACTIVE") {
      bad(`${label} is ${c.status}`);
      if (c.lastErrorMessage) console.log(`      ${c.lastErrorMessage}`);
      blockers.push(`Reconnect ${label}`);
      continue;
    }

    if (!c.agentId) {
      bad(`${label} is active but has NO AGENT — messages are stored, nobody replies`);
      blockers.push(`Assign an agent to ${label} on the Channels page`);
    } else {
      const agent = org.agents.find((a) => a.id === c.agentId);
      ok(`${label} → agent "${agent?.name ?? "unknown"}"${agent?.isActive ? "" : " (PAUSED)"}`);
    }
  }
}

// ── Delivery path ──
console.log("\n── Delivery ──");
const https = env.APP_URL.startsWith("https://");
if (https) {
  ok(`APP_URL is https — Telegram delivers by webhook`);
} else {
  ok(`APP_URL is ${env.APP_URL} — Telegram delivers by POLLING`);
  console.log(`      The worker must be running: bun run worker`);
}

// ── Model ──
console.log("\n── Model ──");
if (!env.MESHAPI_KEY) {
  bad("No MESHAPI_KEY — every model call will fail");
  blockers.push("Set MESHAPI_KEY in .env");
} else {
  ok(`${env.MESHAPI_BASE_URL} · chat=${env.MODEL_CHAT} · utility=${env.MODEL_UTILITY}`);
}

const usage = await prisma.usageRecord.aggregate({ _sum: { costUsd: true }, _count: true });
console.log(`      ${usage._count} model calls so far · $${Number(usage._sum.costUsd ?? 0).toFixed(6)}`);

// ── Recent traffic ──
const recent = await prisma.message.findMany({
  orderBy: { createdAt: "desc" },
  take: 6,
  select: { direction: true, body: true, aiGenerated: true, createdAt: true },
});
if (recent.length) {
  console.log("\n── Last messages ──");
  for (const m of recent.reverse()) {
    const who = m.direction === "INBOUND" ? "them" : m.aiGenerated ? "AI  " : "you ";
    console.log(`  ${m.createdAt.toLocaleTimeString("en-GB")} ${who} │ ${m.body.slice(0, 70)}`);
  }
}

console.log("\n── What to do next ──");
if (!blockers.length) {
  console.log("  Nothing. Message the bot and it should answer.\n");
} else {
  blockers.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
  console.log();
}

await prisma.$disconnect();
