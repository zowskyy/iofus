import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts on purpose: these tests spawn real child
// processes (via tsx) to exercise genuine multi-process SQLite contention,
// which takes tens of seconds per case — deliberately kept out of the fast
// `npm test` unit-suite feedback loop, the same way E2E has its own runner.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/concurrency/**/*.test.ts"],
    testTimeout: 60_000,
    // Real multi-process tests spawn several `node` processes each; running
    // multiple such test files in parallel risks resource contention that
    // has nothing to do with the SQLite invariant under test.
    fileParallelism: false,
  },
});
