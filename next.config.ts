import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres em WebAssembly) só é usado no modo demonstração (npm run demo)
  serverExternalPackages: ["@electric-sql/pglite"],
  // Fora da Vercel, gera em ".next.nosync": a pasta Desktop sincroniza com o iCloud, que
  // duplica arquivos gerados ("arquivo 2.json"); pastas terminadas em .nosync são ignoradas.
  distDir: process.env.NEXT_DIST_DIR ?? (process.env.VERCEL ? ".next" : ".next.nosync"),
  // upload da foto do login e dos escudos (já redimensionados no navegador)
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
