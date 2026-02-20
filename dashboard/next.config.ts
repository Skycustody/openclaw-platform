import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Use dashboard as root so Next doesn't warn about monorepo lockfiles
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
