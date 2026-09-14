import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prisma's query engine is a native binary; keep it out of the bundler.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
