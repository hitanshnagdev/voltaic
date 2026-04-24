import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    // Keep the output quiet in CI; verbose locally.
    reporters: process.env.CI ? ["default"] : ["verbose"],
  },
});
