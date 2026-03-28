import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // @prisma/adapter-pg は Node.js ネイティブ pg モジュールに依存するため外部化
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
};

export default nextConfig;
