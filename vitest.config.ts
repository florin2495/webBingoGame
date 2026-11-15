import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only the "@/..." alias of tsconfig.json, so tests can import server modules (src/lib/server/*.test.ts).
// Default test discovery stays: *.test.ts; Playwright files are *.e2e.ts and are not picked up.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
