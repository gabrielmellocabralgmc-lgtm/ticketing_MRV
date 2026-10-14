import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres em WebAssembly) só é usado no modo demonstração (npm run demo)
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
