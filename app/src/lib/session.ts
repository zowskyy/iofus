import { cookies } from "next/headers";
import { createSession, destroySession, resolveSession, type User } from "./auth";

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

/** Retrieve the authenticated user from the session cookie, or null if not signed in. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  // The unprefixed name is still read so sessions issued before the prefix
  // existed are not all invalidated by a single deploy. Only the current name
  // is ever written.
  const token = jar.get(cookieName())?.value ?? jar.get(LEGACY_COOKIE_NAME)?.value;
  return resolveSession(token);
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
