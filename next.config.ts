import type { NextConfig } from "next";

const isTauri   = process.env.TAURI_ENV_DEBUG !== undefined || process.env.TAURI === "1";
const isStaging = process.env.DEPLOY_TARGET === "staging";

const nextConfig: NextConfig = {
  output: isTauri ? "export" : undefined,
  images: { unoptimized: true },
  assetPrefix: isTauri ? "/" : undefined,
  basePath: isStaging ? "/edit" : undefined,
  trailingSlash: isStaging ? true : undefined,
};

export default nextConfig;
