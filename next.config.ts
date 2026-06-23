import type { NextConfig } from "next";

const isTauri   = process.env.TAURI_ENV_DEBUG !== undefined || process.env.TAURI === "1";
const isStaging = process.env.DEPLOY_TARGET === "staging";

const nextConfig: NextConfig = {
  output: isTauri ? "export" : undefined,
  images: { unoptimized: true },
  assetPrefix: isTauri ? "/" : undefined,
  basePath: isStaging ? "/edit" : undefined,
  webpack(config, { isServer }) {
    if (!isServer) {
      // Emit libraw.wasm to static/chunks/ so the libraw-wasm WebWorker can fetch it
      // by relative URL (worker's import.meta.url is also in static/chunks/)
      config.module.rules.push({
        test: /libraw\.wasm$/,
        type: "asset/resource",
        generator: { filename: "static/chunks/[name][ext]" },
      });
    }
    return config;
  },
};

export default nextConfig;
