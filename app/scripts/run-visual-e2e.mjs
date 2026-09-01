// Cross-platform stand-in for `PW_SUITE=visual playwright test`, whose
// inline env-var syntax only works in a POSIX shell — it fails outright
// under Windows cmd.exe and silently doesn't set the variable under
// PowerShell. Setting the env var here, in a plain Node script npm always
// invokes with `node` regardless of the host shell, works identically on
// all three without adding a dependency (e.g. cross-env) for what Node
// itself already does.
import { spawn } from "node:child_process";

// Forward any extra args (e.g. `-- --update-snapshots`, `-g "pattern"`) —
// dropped silently before this fix, which meant `npm run test:e2e:visual --
// --update-snapshots` looked like it ran but never actually wrote new
// baselines.
const extraArgs = process.argv.slice(2);

const child = spawn("npx", ["playwright", "test", "--project=chromium", ...extraArgs], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PW_SUITE: "visual" },
});

child.on("exit", (code) => process.exit(code ?? 1));
