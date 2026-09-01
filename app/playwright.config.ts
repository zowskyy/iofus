import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3100;

// Next.js's dev server refuses to start a second instance from the same
// project directory even on a different port (it keeps a directory-scoped
// lock, not a port-scoped one) — so two `next dev` webServers can't run
// concurrently here. Visual regression still needs its own database: the
// functional/a11y/perf specs create dozens of same-day accounts, and
// Explore's "N pages redecorated in the last 24h" banner is *conditionally
// rendered*, so its presence (not just its content) shifts the layout of
// everything below it once real accounts exist — a mask can't fix a
// shifted layout, only painted-over pixels. The fix that doesn't require
// two concurrent servers: one webServer, sequential invocations, and the
// database path picked by which suite is running (npm run test:e2e vs.
// npm run test:e2e:visual — see package.json).
const isVisualSuite = process.env.PW_SUITE === "visual";
const DB_PATH = path.join(__dirname, ".e2e-data", isVisualSuite ? "iofus-e2e-visual.db" : "iofus-e2e-shared.db");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: isVisualSuite ? /visual-regression\.spec\.ts/ : undefined,
  testIgnore: isVisualSuite ? undefined : /visual-regression\.spec\.ts/,
  fullyParallel: false, // shared SQLite file — avoid cross-test races
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  expect: {
    // Strict enough to catch a real spacing/color regression, loose enough
    // to absorb sub-pixel font/anti-aliasing noise between runs.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- -p " + PORT,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      IOFUS_DB_PATH: DB_PATH,
      IOFUS_AUTO_MODERATOR_SEED: "false",
    },
  },
});
