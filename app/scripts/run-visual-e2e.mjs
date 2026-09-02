// Cross-platform stand-in for `PW_SUITE=visual playwright test`, whose
// inline env-var syntax only works in a POSIX shell — it fails outright
// under Windows cmd.exe and silently doesn't set the variable under
// PowerShell. Setting the env var here, in a plain Node script npm always
// invokes with `node` regardless of the host shell, works identically on
// all three without adding a dependency (e.g. cross-env) for what Node
// itself already does.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Forward any extra args (e.g. `-- --update-snapshots`, `-g "pattern"`) —
// dropped silently before this fix, which meant `npm run test:e2e:visual --
// --update-snapshots` looked like it ran but never actually wrote new
// baselines.
const extraArgs = process.argv.slice(2);

// The visual suite's whole reason for a separate database (see the comment
// in playwright.config.ts) is pixel-exact screenshots — but nothing ever
// reset that database between runs. Confirmed by actually re-running the
// suite back-to-back without wiping it: 14/14 pass on a fresh DB, then
// 13/14 fail on the second run alone, purely from accounts and content the
// first run's own accounts/pages left behind (e.g. Explore's "N pages
// redecorated" banner). Deleting the DB (and its WAL/SHM siblings) before
// every invocation makes the suite idempotent — safe to re-run locally or
// after a CI retry — instead of only passing the first time a machine ever
// runs it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const visualDbPath = path.join(__dirname, "..", ".e2e-data", "iofus-e2e-visual.db");
for (const suffix of ["", "-shm", "-wal"]) {
  const file = visualDbPath + suffix;
  if (existsSync(file)) rmSync(file);
}

// shell: true joins the args array into one string before handing it to the
// shell, so a multi-word arg like ["-g", "publish theme"] arrives as four
// separate tokens (-g publish theme) instead of two — silently breaking
// `-g "pattern with spaces"` forwarding. shell: false preserves each array
// element as its own argv entry, but on Windows npx only exists as an
// npx.cmd batch file, and Windows can't exec a .cmd directly without a
// shell interpreting it (spawn throws EINVAL) — using npx at all with
// shell: false is a dead end on Windows. Bypassing npx and invoking
// @playwright/test's own CLI entrypoint through `node` sidesteps both
// problems: `node` is a real executable on every platform, so shell: false
// works everywhere and args stay as individual argv entries throughout.
// @playwright/test's package.json "exports" map doesn't expose cli.js as a
// subpath import, so we resolve the package's own package.json (which is
// exported) and derive cli.js from its directory instead.
const require = createRequire(import.meta.url);
const playwrightPkgDir = path.dirname(require.resolve("@playwright/test/package.json"));
const playwrightCli = path.join(playwrightPkgDir, "cli.js");

const child = spawn(process.execPath, [playwrightCli, "test", "--project=chromium", ...extraArgs], {
  stdio: "inherit",
  shell: false,
  env: { ...process.env, PW_SUITE: "visual" },
});

child.on("exit", (code) => process.exit(code ?? 1));
