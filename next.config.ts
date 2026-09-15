import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Prisma's query engine is a native binary; keep it out of the bundler.
  // bullmq/ioredis join it because they are server-only and resolve optional
  // backends (@valkey/valkey-glide) through a runtime require() inside a
  // try/catch. Bundled, webpack cannot see that and reports the optional
  // dependency as "Module not found" on every build, plus a "critical
  // dependency" warning from bullmq's child-processor. External, node resolves
  // them normally and lib/queue.ts's lazy import() behaves as written.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "bullmq", "ioredis"],

  // There is an unrelated package-lock.json one level up in Desktop/fignuxt, so
  // Next infers THAT directory as the workspace root and collects build traces
  // across six sibling projects. Pin the root to this app.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
