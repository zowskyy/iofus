import { statSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Thrown when a production boot is misconfigured in a way that would cause
 * silent data loss, silent non-delivery, or a security control that looks
 * enabled but isn't. Always fatal — never caught and downgraded to a warning.
 */
export class ProductionConfigError extends Error {}

export type EnvLike = Record<string, string | undefined>;

/** Injectable for tests; real callers use the default. */
export interface ConfigDeps {
  /** Returns the st_dev of *path*, or null when the path cannot be stat'd. */
  deviceIdOf(path: string): number | null;
}

const realDeps: ConfigDeps = {
  deviceIdOf(path) {
    try {
      return statSync(path).dev;
    } catch {
      return null;
    }
  },
};

/**
 * True when *dbPath*'s directory lives on a different device than `/`.
 *
 * Inside a container, the root filesystem is the image's writable layer, which
 * is discarded on every redeploy. A mounted volume is a separate device, so a
 * differing st_dev is positive evidence the database will actually survive.
 * Same device means the file is on the ephemeral layer.
 */
export function dbPathIsPersistent(dbPath: string, deps: ConfigDeps = realDeps): boolean {
  const dir = deps.deviceIdOf(dirname(dbPath));
  const root = deps.deviceIdOf("/");
  if (dir === null || root === null) return false;
  return dir !== root;
}

/** Parses a trusted-proxy hop count. Returns null when absent or not a non-negative integer. */
export function parseProxyHops(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/**
 * Every fatal production misconfiguration found in *env*, as operator-facing
 * sentences. Empty array means the boot is safe. Pure — no I/O beyond `deps`.
 */
export function productionConfigProblems(env: EnvLike, deps: ConfigDeps = realDeps): string[] {
  const problems: string[] = [];

  if (!env.IOFUS_SMTP_HOST?.trim()) {
    problems.push(
      "IOFUS_SMTP_HOST is not set. Password-reset and email-change messages would be written to the container log instead of delivered, exposing live reset tokens to anyone with log access.",
    );
  }

  if (!env.IOFUS_ALLOWED_ORIGIN?.trim()) {
    problems.push(
      "IOFUS_ALLOWED_ORIGIN is not set. Password-reset links and sitemap URLs would be generated against http://localhost:3000.",
    );
  }

  if (!env.IOFUS_MODERATOR_HANDLE?.trim()) {
    problems.push(
      "IOFUS_MODERATOR_HANDLE is not set. No account can ever be promoted to moderator, leaving the report and appeal queues permanently unactionable.",
    );
  }

  if (env.IOFUS_AUTO_MODERATOR_SEED === "true") {
    problems.push(
      "IOFUS_AUTO_MODERATOR_SEED is enabled. The first account to sign up would silently receive moderator rights. Set IOFUS_MODERATOR_HANDLE instead.",
    );
  }

  if (env.IOFUS_DISABLE_RATE_LIMIT === "true") {
    problems.push(
      "IOFUS_DISABLE_RATE_LIMIT is set. This flag exists only for the end-to-end suite and must never be present in production.",
    );
  }

  if (parseProxyHops(env.IOFUS_TRUSTED_PROXY_HOPS) === null) {
    problems.push(
      "IOFUS_TRUSTED_PROXY_HOPS is not set to a non-negative integer. Without it the client IP cannot be located in X-Forwarded-For: every anonymous visitor would share one rate-limit bucket, or the limit would key off a client-supplied value. See docs/DEPLOY.md for how to measure it.",
    );
  }

  const dbPath = env.IOFUS_DB_PATH?.trim();
  if (!dbPath) {
    problems.push(
      "IOFUS_DB_PATH is not set. The database would fall back to a path inside the application bundle, which is destroyed on every redeploy.",
    );
  } else if (!dbPathIsPersistent(dbPath, deps) && env.IOFUS_ACK_EPHEMERAL_DB !== "true") {
    problems.push(
      `IOFUS_DB_PATH (${dbPath}) is not on a mounted volume — it is on the container's ephemeral layer, so every account, page, guestbook entry and message would be destroyed on the next deploy. Attach a persistent disk whose mount path contains this file. To run deliberately without persistence (throwaway preview only), set IOFUS_ACK_EPHEMERAL_DB=true.`,
    );
  }

  return problems;
}

/**
 * Fails the boot when production configuration is unsafe. A no-op outside
 * production. Called from `instrumentation.ts`'s `register()`, which Next runs
 * to completion before the server accepts any request.
 */
export function validateProductionConfig(env: EnvLike = process.env, deps: ConfigDeps = realDeps): void {
  if (env.NODE_ENV !== "production") return;

  const problems = productionConfigProblems(env, deps);
  if (problems.length === 0) return;

  throw new ProductionConfigError(
    `Refusing to start: ${problems.length} fatal configuration problem(s).\n\n` +
      problems.map((p, i) => `  ${i + 1}. ${p}`).join("\n\n") +
      "\n",
  );
}
