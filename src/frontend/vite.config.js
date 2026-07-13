import { fileURLToPath, URL } from "url";
import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import environment from "vite-plugin-environment";

// Populate process.env with canister IDs from env.json BEFORE the environment()
// plugin runs, so import.meta.env.CANISTER_ID_BACKEND resolves at build time.
// Without this, env.json ships 'undefined' and the ?? 'aaaaa-aa' fallback in
// explorerService.ts / useAuth.ts points at the management canister.
const envPath = path.resolve(fileURLToPath(new URL("./env.json", import.meta.url)));
try {
  const envJson = JSON.parse(fs.readFileSync(envPath, "utf-8"));
  if (envJson.backend_canister_id && envJson.backend_canister_id !== "undefined") {
    process.env.CANISTER_ID_BACKEND = envJson.backend_canister_id;
  }
  if (envJson.frontend_canister_id && envJson.frontend_canister_id !== "undefined") {
    process.env.CANISTER_ID_FRONTEND = envJson.frontend_canister_id;
  }
} catch {
  // env.json missing or unreadable — fall back to existing process.env values
}

const ii_url =
  process.env.DFX_NETWORK === "local"
    ? `http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8081/`
    : `https://identity.internetcomputer.org/`;

process.env.II_URL = process.env.II_URL || ii_url;
process.env.STORAGE_GATEWAY_URL =
  process.env.STORAGE_GATEWAY_URL || "https://blob.caffeine.ai";

export default defineConfig({
  logLevel: "error",
  build: {
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
  },
  css: {
    postcss: "./postcss.config.js",
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    environment("all", { prefix: "CANISTER_" }),
    environment("all", { prefix: "DFX_" }),
    environment(["II_URL"]),
    environment(["STORAGE_GATEWAY_URL"]),
    react(),
  ],
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(new URL("../declarations", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
    dedupe: ["@dfinity/agent"]
  },
});
