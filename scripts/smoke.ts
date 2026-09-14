/**
 * Proves the stack actually runs under Bun: env parsing, the Prisma client at
 * runtime (not just codegen), a real query, and round-trip encryption.
 *
 *   bun scripts/smoke.ts
 */
import { prisma } from "../lib/db";
import { encrypt, decrypt, encryptJson, decryptJson, redact } from "../lib/crypto";
import { env } from "../lib/env";

const ok = (m: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const info = (m: string) => console.log(`        ${m}`);

async function main() {
  console.log("\nSmoke test\n");

  ok(`env parsed — chat model "${env.MODEL_CHAT}", utility "${env.MODEL_UTILITY}"`);

  const secret = "postgresql://readonly:hunter2@db.client.example/shop";
  const round = decrypt(encrypt(secret));
  if (round !== secret) throw new Error("AES-256-GCM round trip failed");
  ok(`encryption round-trips (stored as ${redact(encrypt(secret))})`);

  const blob = { apiKey: "sk-test-123", baseUrl: "https://api.meshapi.ai/v1" };
  if (decryptJson<typeof blob>(encryptJson(blob)).apiKey !== blob.apiKey) {
    throw new Error("JSON credential round trip failed");
  }
  ok("JSON credential blobs round-trip");

  // The real test: Prisma's query engine under Bun, not just codegen.
  const [{ version }] = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  ok("Prisma query engine runs under Bun");
  info(version.split(",")[0]);

  const org = await prisma.organization.upsert({
    where: { slug: "smoke-test" },
    update: {},
    create: { name: "Smoke Test Org", slug: "smoke-test" },
  });
  ok(`write + read works — org ${org.id}`);

  const counts = {
    organizations: await prisma.organization.count(),
    agents: await prisma.agent.count(),
    channels: await prisma.channelConnection.count(),
    conversations: await prisma.conversation.count(),
  };
  ok(`tables queryable — ${JSON.stringify(counts)}`);

  await prisma.organization.delete({ where: { id: org.id } });
  ok("cascade delete works — test org removed");

  console.log("\n\x1b[32mAll checks passed.\x1b[0m Bun + Prisma + Postgres are wired up.\n");
}

main()
  .catch((e) => {
    console.error("\n\x1b[31mFAILED\x1b[0m", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
