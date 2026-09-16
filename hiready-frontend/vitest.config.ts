import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    /**
     * Mirrors the "@" alias in vite.config.ts. Without it any module that
     * imports through "@/..." fails to resolve under vitest, so a test could
     * only ever cover files that happened to use relative imports — which is
     * most of src/, and none of the pages.
     */
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // .tsx is included so component tests are possible at all; they also need
    // environment "jsdom", which is a separate change.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
