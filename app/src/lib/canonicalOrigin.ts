import type { EnvLike } from "./productionConfig";

/**
 * The absolute origin (scheme + host, no trailing slash) this deployment is
 * reachable at.
 *
 * Always derived from IOFUS_ALLOWED_ORIGIN and never from request headers: the
 * Host header is attacker-controlled, and these URLs end up in password-reset
 * emails, sitemaps served to search engines, and exported pages. A forged Host
 * on a reset request would otherwise point the token at the attacker's server.
 *
 * The production boot gate requires IOFUS_ALLOWED_ORIGIN, so the localhost
 * fallback is only ever reached in development and tests.
 */
export function canonicalOrigin(env: EnvLike = process.env): string {
  const raw = env.IOFUS_ALLOWED_ORIGIN?.trim() ?? "";
  if (!raw) return "http://localhost:3000";

  const withoutTrailingSlash = raw.replace(/\/+$/, "");
  // Accept the value written either as "example.com" or "https://example.com".
  // Matching a bare "http" prefix would misread a host literally named
  // something like "httpbin.org" as already carrying a scheme.
  const hasScheme = /^https?:\/\//i.test(withoutTrailingSlash);
  return hasScheme ? withoutTrailingSlash : `https://${withoutTrailingSlash}`;
}

/** The bare host (no scheme, no trailing slash), for display and link text. */
export function canonicalHost(env: EnvLike = process.env): string {
  return canonicalOrigin(env).replace(/^https?:\/\//i, "");
}
