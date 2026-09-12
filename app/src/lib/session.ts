import { cookies } from "next/headers";
import {
  createSession,
  destroySession,
  resolveSession,
  resolveSessionIssuedBefore,
  type User,
} from "./auth";

// Thin server-side helpers that connect auth.ts's pure session logic to
// Next.js's cookie jar. Kept separate from auth.ts so auth.ts stays
// framework-free and fully unit-testable without a request context.

const LEGACY_COOKIE_NAME = "iofus_session";

/**
 * The `__Host-` prefix makes a browser refuse the cookie unless it is Secure,
 * path=/, and carries no Domain, which stops a compromised or hostile
 * subdomain from writing a session cookie the main site would honour. It
 * requires Secure, so plain-HTTP local development cannot use it.
 */
const SECURE_COOKIE_NAME = "__Host-iofus_session";

function isSecureContext(): boolean {
  return process.env.NODE_ENV === "production";
}

function cookieName(): string {
  return isSecureContext() ? SECURE_COOKIE_NAME : LEGACY_COOKIE_NAME;
}

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days, matches SESSION_TTL_MS in auth.ts

/**
 * Only sessions issued before this instant are still accepted from the
 * unprefixed cookie. It is the date this migration was written, so every
 * session that existed beforehand keeps working while anything issued later --
 * which is what an injected cookie must be -- does not.
 *
 * Sessions last 30 days, so after 2026-10-12 no pre-migration session can
 * still be valid, and this constant, the fallback below, and
 * LEGACY_COOKIE_NAME should all be deleted.
 */
const LEGACY_COOKIE_CUTOFF = new Date("2026-09-12T00:00:00.000Z");

/** Retrieve the authenticated user from the session cookie, or null if not signed in. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();

  const current = jar.get(cookieName())?.value;
  if (current) return resolveSession(current);

  // The unprefixed name is still read so a single deploy does not sign
  // everyone out -- but only for sessions issued before the migration.
  // Accepting any legacy cookie would undo the point of the __Host- prefix: a
  // sibling subdomain could set a parent-domain cookie and, since the victim
  // has no prefixed cookie yet, silently put them in the attacker's session.
  // An injected cookie necessarily names a session created after the cutoff.
  const legacy = jar.get(LEGACY_COOKIE_NAME)?.value;
  if (!legacy) return null;
  return resolveSessionIssuedBefore(legacy, LEGACY_COOKIE_CUTOFF);
}

/** Create a session and set an httpOnly cookie for *userId*. */
export async function logIn(userId: string): Promise<void> {
  // A fresh token per login, so a session identifier captured earlier is not
  // revalidated by a later successful sign-in.
  const token = createSession(userId);
  const jar = await cookies();
  jar.set(cookieName(), token, {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/** Clear the session cookie and invalidate the session token. */
export async function logOut(): Promise<void> {
  const jar = await cookies();
  for (const name of [cookieName(), LEGACY_COOKIE_NAME]) {
    const token = jar.get(name)?.value;
    if (token) destroySession(token);
    jar.delete(name);
  }
}
