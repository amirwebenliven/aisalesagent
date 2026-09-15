/**
 * Wipe ALL tenant data — organizations, users, agents, channels, contacts,
 * conversations, messages, knowledge, usage. Leaves the schema intact.
 *
 *   bun scripts/reset.ts --yes
 *
 * Requires --yes because there is no undo. Organization cascades to everything
 * tenant-owned, but User is deliberately separate (a user can belong to several
 * organizations), so it is deleted explicitly.
 */
import { prisma } from "../lib/db";

if (!process.argv.includes("--yes")) {
  console.error("\nThis deletes every organization, user and conversation.");
  console.error("Re-run with --yes if that is what you want:\n");
  console.error("  bun scripts/reset.ts --yes\n");
  process.exit(1);
}

const before = {
  organizations: await prisma.organization.count(),
  users: await prisma.user.count(),
  agents: await prisma.agent.count(),
  channels: await prisma.channelConnection.count(),
  contacts: await prisma.contact.count(),
  conversations: await prisma.conversation.count(),
  messages: await prisma.message.count(),
  faqs: await prisma.faq.count(),
  usage: await prisma.usageRecord.count(),
};

console.log("\nBefore:");
for (const [k, v] of Object.entries(before)) console.log(`  ${k.padEnd(15)} ${v}`);

// Organization cascades to agents, channels, contacts, conversations, messages,
// knowledge, data sources, jobs and usage. Memberships go with either side.
await prisma.organization.deleteMany({});
await prisma.user.deleteMany({});

const after = {
  organizations: await prisma.organization.count(),
  users: await prisma.user.count(),
  agents: await prisma.agent.count(),
  channels: await prisma.channelConnection.count(),
  contacts: await prisma.contact.count(),
  conversations: await prisma.conversation.count(),
  messages: await prisma.message.count(),
  faqs: await prisma.faq.count(),
  usage: await prisma.usageRecord.count(),
};

const leftovers = Object.entries(after).filter(([, v]) => v > 0);

console.log("\nAfter:");
for (const [k, v] of Object.entries(after)) console.log(`  ${k.padEnd(15)} ${v}`);

if (leftovers.length) {
  console.error(`\nRows survived the cascade: ${leftovers.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.error("That means a relation is missing onDelete: Cascade in schema.prisma.");
  process.exit(1);
}

console.log("\nClean. Create your account at http://localhost:3000/signup\n");
await prisma.$disconnect();
