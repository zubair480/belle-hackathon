import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Default environment is node. UI tests (Ali, frontend/tests/ui/**) can opt into jsdom per file with:
//   // @vitest-environment jsdom
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}", "frontend/tests/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    testTimeout: 20_000,
  },
});
