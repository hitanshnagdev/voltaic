import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the `@/*` path mapping from tsconfig.json so source files that
      // use it can be loaded under vitest the same way Next.js would.
      "@": root,
    },
  },
  test: {
    include: [
      "lib/**/*.test.ts",
      "scripts/**/*.test.ts",
      "inngest/**/*.test.ts",
    ],
    environment: "node",
    // Keep the output quiet in CI; verbose locally.
    reporters: process.env.CI ? ["default"] : ["verbose"],
    // Stub Next.js's `server-only` guard so we can unit-test pure helpers
    // exported from modules that also import server-only utilities.
    // The guard is a runtime safety net for the bundler, not for tests.
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});
