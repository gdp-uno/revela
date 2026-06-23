#!/usr/bin/env node
// Copies libraw-wasm worker + wasm to public/ so Next.js can serve them
// at a stable URL that the custom RawDecoder wrapper can reference.
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "../node_modules/libraw-wasm/dist");
const dst = path.resolve(__dirname, "../public/libraw-wasm");

fs.mkdirSync(dst, { recursive: true });
fs.copyFileSync(path.join(src, "libraw.wasm"), path.join(dst, "libraw.wasm"));
fs.copyFileSync(path.join(src, "worker.js"),   path.join(dst, "worker.js"));

console.log("✓ libraw-wasm files copied to public/libraw-wasm/");
