import type { NextConfig } from "next";

const isTauri = process.env.TAURI_ENV_DEBUG !== undefined || process.env.TAURI === "1";

const nextConfig: NextConfig = {
  output: isTauri ? "export" : undefined,
  images: {
    unoptimized: true,
  },
  // Allow Tauri's custom protocol
  assetPrefix: isTauri ? "/" : undefined,
};

export default nextConfig;
