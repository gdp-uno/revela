import type { NextConfig } from "next";

const isTauri   = process.env.TAURI_ENV_DEBUG !== undefined || process.env.TAURI === "1";
const isStaging = process.env.DEPLOY_TARGET === "staging";

const nextConfig: NextConfig = {
  output: isTauri ? "export" : undefined,
  images: { unoptimized: true },
  assetPrefix: isTauri ? "/" : undefined,
  basePath: isStaging ? "/edit" : undefined,
  // Required for Next.js 16 which defaults to Turbopack
  turbopack: {},
  // Expose basePath to client-side code for the RAW worker URL
  env: {
    NEXT_PUBLIC_BASE_PATH: isStaging ? "/edit" : "",
  },
};

export default nextConfig;
