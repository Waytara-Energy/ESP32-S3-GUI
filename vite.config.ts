import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// No React plugin: esbuild's automatic JSX transform is all this page needs.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  // fileURLToPath keeps a folder name with spaces ("ESP32-S3 GUI") intact; a plain URL pathname would leave "%20" in it.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { target: "es2022", sourcemap: false },
  server: { port: 5174 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
