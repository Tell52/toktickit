import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Legacy API suites share DATABASE_URL, count whole tables, and temporarily
    // change other administrators. Their setup/cleanup must not overlap.
    fileParallelism: false,
  },
});
