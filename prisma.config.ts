import path from "node:path";
import "dotenv/config"; // prisma.config.ts disables Prisma's own .env loading
import type { PrismaConfig } from "prisma";

// Replaces the deprecated `package.json#prisma` block (removed in Prisma 7).
export default {
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    // Bun runs TypeScript natively, so no tsx in the chain.
    seed: "bun prisma/seed.ts",
  },
} satisfies PrismaConfig;
