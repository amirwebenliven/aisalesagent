/**
 * Regression test for the two isolation bugs found on 15 Sep 2026.
 *
 *   bun scripts/verify-isolation.ts
 *
 * 1. Cross-tenant dedup collision. One person messaging two tenants' Telegram
 *    bots produces the same `tg:<chatId>:<messageId>` — chat.id in a private
 *    chat IS the user's own id, identical for every bot, and message_id
 *    restarts low per chat. Under the old GLOBAL unique on Message.providerId
 *    the second tenant's message was silently swallowed.
 *
 * 2. Revoked membership. currentOrg() resolved the organization straight from
 *    the cookie's claim, so deleting a Membership left the session fully
 *    working until the 30-day token expired.
 *
 * Creates its own tenants, asserts, and removes them. Never touches other data.
 */
import { prisma } from "../lib/db";
import { persistInbound, telegramAdapter } from "../lib/channels";
import { encryptJson } from "../lib/crypto";

const TAG = "isoverify";
const ok = (m: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const fail = (m: string) => {
  console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
  failures++;
};
let failures = 0;

// Same human, same first message id — what Telegram really sends.
const SHARED_CHAT_ID = 700700700;
const FIRST_MESSAGE_ID = 1;

function update(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: FIRST_MESSAGE_ID,
      from: { id: SHARED_CHAT_ID, is_bot: false, first_name: "Same Human" },
      chat: { id: SHARED_CHAT_ID, type: "private" },
      date: Math.floor(Date.parse("2026-09-15T12:00:00Z") / 1000),
      text,
    },
  };
}

async function makeTenant(n: number) {
  const org = await prisma.organization.create({
    data: { name: `Iso Verify ${n}`, slug: `${TAG}-${n}` },
  });
  const agent = await prisma.agent.create({
    data: {
      organizationId: org.id,
      name: `Agent ${n}`,
      persona: "x", goal: "x", companyInfo: "x", rules: "x",
      conversationFlow: "x", alertHumanWhen: "x", concludeWhen: "x",
    },
  });
  const channel = await prisma.channelConnection.create({
    data: {
      organizationId: org.id,
      agentId: agent.id,
      kind: "TELEGRAM",
      displayName: `bot${n}`,
      externalId: `isoverify_bot${n}`,
      status: "ACTIVE",
      credentialsEnc: encryptJson({ botToken: `000${n}:fake`, secretToken: `secret${n}` }),
    },
  });
  return { org, agent, channel };
}

console.log("\nIsolation regression\n");

await prisma.organization.deleteMany({ where: { slug: { startsWith: TAG } } });

const t1 = await makeTenant(1);
const t2 = await makeTenant(2);

// ── 1. The collision ────────────────────────────────────────────────────────
const m1 = telegramAdapter.parseInbound(update("hi tenant 1 bot"));
const m2 = telegramAdapter.parseInbound(update("THIS IS THE LOST MESSAGE"));

if (!m1 || !m2) throw new Error("parseInbound returned null for a normal message");
if (m1.providerId !== m2.providerId) {
  throw new Error(`Test is wrong: expected identical providerIds, got ${m1.providerId} / ${m2.providerId}`);
}
console.log(`  both tenants receive providerId "${m1.providerId}"\n`);

const r1 = await persistInbound(t1.channel, m1);
const r2 = await persistInbound(t2.channel, m2);

if (r1.deduped) fail("tenant 1's first message was deduped — it should be new");
else ok("tenant 1's message stored");

if (r2.deduped) fail("tenant 2's message was SWALLOWED by tenant 1's — the bug is back");
else ok("tenant 2's message stored despite the identical provider id");

const lost = await prisma.message.findFirst({
  where: { organizationId: t2.org.id, body: { contains: "LOST MESSAGE" } },
});
if (lost) ok("tenant 2's message is in tenant 2's data");
else fail("tenant 2's message is missing from the database");

// ── 2. A genuine redelivery must still dedup ────────────────────────────────
const again = await persistInbound(t1.channel, telegramAdapter.parseInbound(update("hi tenant 1 bot"))!);
if (again.deduped) ok("a real redelivery on the same conversation still dedups");
else fail("redelivery was NOT deduped — dedup is broken, customers get double replies");

// ── 3. Revoked membership ───────────────────────────────────────────────────
const user = await prisma.user.create({
  data: { email: `${TAG}-user@example.com`, name: "Revoked" },
});
const membership = await prisma.membership.create({
  data: { userId: user.id, organizationId: t1.org.id, role: "OWNER" },
});

const resolves = async () =>
  prisma.membership.findFirst({
    where: {
      userId: user.id,
      organizationId: t1.org.id,
      organization: { isActive: true },
    },
    include: { organization: true },
  });

if (await resolves()) ok("a current member resolves to their workspace");
else fail("a current member does NOT resolve — currentOrg would lock out a real user");

await prisma.membership.delete({ where: { id: membership.id } });

if (await resolves()) fail("a REVOKED member still resolves — removal does not take effect");
else ok("a revoked member no longer resolves (currentOrg sends them to /api/auth/stale)");

// ── Cleanup ─────────────────────────────────────────────────────────────────
await prisma.organization.deleteMany({ where: { slug: { startsWith: TAG } } });
await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });

console.log(
  failures === 0
    ? "\n\x1b[32mAll isolation checks passed.\x1b[0m\n"
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`,
);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
