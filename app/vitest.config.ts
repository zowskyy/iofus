import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // .tsx was silently excluded before: a component test would have been
    // skipped without failing anything.
    include: ["src/**/*.test.{ts,tsx}"],
    env: {
      // Password hashing runs at OWASP's 2^17 in production, which is far too
      // slow for a suite that creates hundreds of accounts. Ignored whenever
      // NODE_ENV is production, so this cannot weaken a real deployment.
      IOFUS_SCRYPT_LOG_N: "10",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
