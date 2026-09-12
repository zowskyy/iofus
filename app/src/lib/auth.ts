import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getDb } from "./db";

// Password hashing uses Node's built-in crypto.scrypt (no external
// dependency, no native module to compile) rather than bcrypt/argon2
// packages. scrypt is a well-established, still-secure KDF and this is
// the pattern Node's own docs recommend for password storage.

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

/** log2 of scrypt's cost parameter. OWASP's current floor for scrypt is 2^17. */
export const PRODUCTION_SCRYPT_LOG_N = 17;

/**
 * A deliberately slow KDF makes test suites that create hundreds of accounts
 * unusable, so the cost may be lowered locally. The override is ignored in
 * production, where the constant above always wins -- the work factor can
 * never be weakened by an environment variable on a real deployment.
 */
function resolveScryptLogN(): number {
  if (process.env.NODE_ENV === "production") return PRODUCTION_SCRYPT_LOG_N;
  const raw = process.env.IOFUS_SCRYPT_LOG_N;
  if (raw && /^\d+$/.test(raw)) {
    const parsed = Number(raw);
    if (parsed >= 1 && parsed <= 20) return parsed;
  }
  return PRODUCTION_SCRYPT_LOG_N;
}

export const SCRYPT_LOG_N = resolveScryptLogN();

/**
 * Node's built-in default (16384). Hashes written before parameters were
 * stored alongside them used it implicitly, so that is what they must be
 * verified with.
 */
const LEGACY_LOG_N = 14;

function scryptOptions(logN: number) {
  const n = 2 ** logN;
  // scrypt needs roughly 128 * N * r bytes. Node's default maxmem is 32 MB,
  // well under what N=2^17 requires, and it throws rather than degrading.
  return { N: n, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * n * SCRYPT_R };
}

/**
 * Caps how many password hashes run concurrently.
 *
 * scryptSync serialized this implicitly: the event loop could only ever be
 * inside one hash at a time. Moving to async removes that blocking -- which is
 * the point, since a 2^17 hash would otherwise stall every other request --
 * but it also removes the accidental limit on peak memory. At ~134 MB per
 * call, a burst of logins against distinct handles (which the per-handle rate
 * limit does not bound) could exhaust a small instance. Queueing costs some
 * latency under load; running out of memory costs the process.
 */
const MAX_CONCURRENT_HASHES = 2;

/**
 * Cap on requests waiting for a hash slot.
 *
 * MAX_CONCURRENT_HASHES bounds the memory in flight but not the queue behind
 * it. Login is rate-limited per IP and per handle, and neither bounds one
 * client cycling through distinct handles, so an unbounded queue would let
 * pending requests accumulate until the process died. Shedding at a known
 * depth keeps it answering; an unbounded queue only defers the failure and
 * takes every in-flight request down with it.
 */
const MAX_QUEUED_HASHES = 32;

let activeHashes = 0;
const hashQueue: (() => void)[] = [];

/** Thrown when password hashing is saturated and the request was shed rather than queued. */
export class HashCapacityError extends Error {
  constructor() {
    super("The server is busy verifying credentials. Please try again in a moment.");
  }
}

async function withHashSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeHashes >= MAX_CONCURRENT_HASHES) {
    if (hashQueue.length >= MAX_QUEUED_HASHES) throw new HashCapacityError();
    await new Promise<void>((resolve) => hashQueue.push(resolve));
  }
  activeHashes++;
  try {
    return await fn();
  } finally {
    activeHashes--;
    hashQueue.shift()?.();
  }
}

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,29}$/;
const RESERVED_HANDLES = new Set([
  "explore", "make", "studio", "moderation", "api", "admin", "reader", "report",
  "block", "login", "signup", "logout", "settings", "static", "assets",
  "friends", "guestbook", "iofus", "help", "about", "terms", "privacy", "policy", "appeal",
]);

export class ValidationError extends Error {}

export function validateHandle(rawHandle: string): string {
  const handle = rawHandle.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    throw new ValidationError(
      "Handles must be 2-30 characters: lowercase letters, numbers, hyphens, or underscores, and can't start with a hyphen or underscore.",
    );
  }
  if (RESERVED_HANDLES.has(handle)) {
    throw new ValidationError(`"${handle}" is reserved and can't be used as a handle.`);
  }
  return handle;
}

export function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters.");
  }
  if (password.length > 256) {
    throw new ValidationError("Password is too long.");
  }
}

/**
 * Hashes *password* as `scrypt$logN$r$p$salt$hash`.
 *
 * The parameters are stored with the hash rather than assumed, so raising the
 * cost later never invalidates existing passwords: an old hash still says how
 * to verify itself.
 */
export async function hashPassword(password: string, logN: number = SCRYPT_LOG_N): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await withHashSlot(() =>
    scryptAsync(password, salt, SCRYPT_KEYLEN, scryptOptions(logN)),
  );
  return `scrypt$${logN}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

interface ParsedHash {
  logN: number;
  r: number;
  p: number;
  salt: Buffer;
  expected: Buffer;
}

function parseStoredHash(stored: string): ParsedHash | null {
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 6) return null;
    const [, logN, r, p, saltHex, hashHex] = parts as [string, string, string, string, string, string];
    if (!/^\d+$/.test(logN) || !/^\d+$/.test(r) || !/^\d+$/.test(p)) return null;
    if (!saltHex || !hashHex) return null;
    return {
      logN: Number(logN),
      r: Number(r),
      p: Number(p),
      salt: Buffer.from(saltHex, "hex"),
      expected: Buffer.from(hashHex, "hex"),
    };
  }

  // Legacy `saltHex:hashHex`, written before parameters were recorded.
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return null;
  return {
    logN: LEGACY_LOG_N,
    r: 8,
    p: 1,
    salt: Buffer.from(saltHex, "hex"),
    expected: Buffer.from(hashHex, "hex"),
  };
}

/** True when *stored* was written with weaker parameters than we now use. */
export function needsRehash(stored: string): boolean {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  return parsed.logN < SCRYPT_LOG_N || parsed.r !== SCRYPT_R || parsed.p !== SCRYPT_P;
}

// A real (but unused-for-login) hash, computed once, purely so
// authenticate() has something correctly formatted to compare against
// when a handle doesn't exist — keeps that codepath's timing shaped the
// same as the real one instead of hand-typing a hex string that could
// silently be the wrong length. Built lazily now that hashing is async.
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  const actual = await withHashSlot(() =>
    scryptAsync(password, parsed.salt, parsed.expected.length, {
      N: 2 ** parsed.logN,
      r: parsed.r,
      p: parsed.p,
      maxmem: 256 * 2 ** parsed.logN * parsed.r,
    }),
  );
  if (actual.length !== parsed.expected.length) return false;
  return timingSafeEqual(actual, parsed.expected);
}

export interface User {
  id: string;
  handle: string;
  createdAt: string;
}

/** Public lookup by handle — used to resolve /@handle routes. Returns null rather than throwing for "not found," since that's an expected, common case here. */
export function findUserByHandle(rawHandle: string): User | null {
  const handle = rawHandle.trim().toLowerCase();
  const db = getDb();
  const row = db
    .prepare("SELECT id, handle, created_at FROM users WHERE handle_lower = ? AND is_blocked_platform = 0")
    .get(handle) as { id: string; handle: string; created_at: string } | undefined;
  if (!row) return null;
  return { id: row.id, handle: row.handle, createdAt: row.created_at };
}

export class HandleTakenError extends Error {
  constructor(handle: string) {
    super(`The handle "${handle}" is already taken.`);
  }
}

/** True when *error* is a SQLite UNIQUE constraint violation (any indexed column). */
function isUniqueConstraintViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || error.message.includes("UNIQUE constraint failed");
}

/**
 * Creates a user from an already-hashed password.
 *
 * Separate from `createUser` so callers that need the insert inside their own
 * transaction can hash first and keep the write lock held only for the writes:
 * the KDF is deliberately slow, and BEGIN IMMEDIATE blocks every other writer
 * for as long as it is held.
 */
export function createUserWithPasswordHash(rawHandle: string, passwordHash: string): User {
  const handle = validateHandle(rawHandle);
  const db = getDb();

  const existing = db
    .prepare("SELECT id FROM users WHERE handle_lower = ?")
    .get(handle);
  if (existing) throw new HandleTakenError(handle);

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  // The SELECT above only rules out an *already-committed* duplicate — two
  // concurrent signups for the same handle can both pass it and race on
  // this INSERT. The handle_lower UNIQUE index (schema.sql) is the real
  // guard; translate its violation into the same user-facing error the
  // upfront check produces, instead of letting a raw SQLite error surface.
  try {
    db.prepare(
      `INSERT INTO users (id, handle, handle_lower, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, handle, handle, passwordHash, createdAt);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) throw new HandleTakenError(handle);
    throw error;
  }

  return { id, handle, createdAt };
}

export async function createUser(rawHandle: string, password: string): Promise<User> {
  validateHandle(rawHandle);
  validatePassword(password);
  return createUserWithPasswordHash(rawHandle, await hashPassword(password));
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Incorrect handle or password.");
  }
}

export async function authenticate(rawHandle: string, password: string): Promise<User> {
  const handle = rawHandle.trim().toLowerCase();
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, handle, password_hash, created_at, is_blocked_platform FROM users WHERE handle_lower = ?",
    )
    .get(handle) as
    | { id: string; handle: string; password_hash: string; created_at: string; is_blocked_platform: number }
    | undefined;

  // Always run verifyPassword even on a missing user, against a fixed
  // dummy hash, so a nonexistent-handle response takes the same time as
  // a wrong-password response — don't let response timing leak which
  // handles exist.
  const ok = row
    ? await verifyPassword(password, row.password_hash)
    : await verifyPassword(password, await dummyHash());

  if (!row || !ok) throw new InvalidCredentialsError();
  if (row.is_blocked_platform) throw new InvalidCredentialsError();

  // The password is only available in plaintext here, at the moment it is
  // proven correct, so this is the one point where an old hash can be upgraded
  // without forcing a reset. A failure must not cost the user their login.
  if (needsRehash(row.password_hash)) {
    try {
      const upgraded = await hashPassword(password);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(upgraded, row.id);
    } catch (err) {
      console.error("[auth] password rehash failed", err);
    }
  }

  return { id: row.id, handle: row.handle, createdAt: row.created_at };
}

/** Verify credentials for a platform-blocked account (appeals only). */
export async function authenticateBlockedForAppeal(rawHandle: string, password: string): Promise<User> {
  const handle = rawHandle.trim().toLowerCase();
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, handle, password_hash, created_at, is_blocked_platform FROM users WHERE handle_lower = ?",
    )
    .get(handle) as
    | { id: string; handle: string; password_hash: string; created_at: string; is_blocked_platform: number }
    | undefined;

  const ok = row
    ? await verifyPassword(password, row.password_hash)
    : await verifyPassword(password, await dummyHash());
  if (!row || !ok) throw new InvalidCredentialsError();
  if (!row.is_blocked_platform) {
    throw new ValidationError("This account is not platform-blocked. Log in normally if you have access.");
  }

  return { id: row.id, handle: row.handle, createdAt: row.created_at };
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Returns the raw session token (only ever shown to the client once, as a cookie value). */
export function createSession(userId: string): string {
  const db = getDb();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  ).run(tokenHash, userId, now.toISOString(), expiresAt.toISOString());

  // Expired sessions are otherwise only ever deleted lazily, if someone
  // happens to present that exact expired token again — an abandoned
  // account's rows would sit in the table forever. Piggyback a sweep on
  // the low-frequency "someone is logging in" path rather than adding a
  // background job.
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now.toISOString());

  return rawToken;
}

function hashToken(rawToken: string): string {
  // Sessions are looked up by exact hash match (not scrypt — tokens are
  // already high-entropy random, no need for a slow KDF here), so a
  // fast, deterministic hash is correct and keeps lookups cheap. This
  // runs on every getCurrentUser() call (i.e. every authenticated page
  // load), so an actual slow KDF here would be a self-inflicted cost.
  return createHash("sha256").update("iofus-session-salt-v1").update(rawToken).digest("hex");
}

/**
 * Resolves a session only when it was issued before *cutoff*.
 *
 * Used for the unprefixed legacy cookie during the `__Host-` migration. A
 * subdomain that injects a cookie can only inject a session it created, which
 * is necessarily newer than the cutoff, so bounding acceptance by issue time
 * keeps existing sign-ins working without reopening the door the `__Host-`
 * prefix exists to close.
 */
export function resolveSessionIssuedBefore(rawToken: string | undefined, cutoff: Date): User | null {
  if (!rawToken) return null;
  const row = getDb()
    .prepare("SELECT created_at FROM sessions WHERE token_hash = ?")
    .get(hashToken(rawToken)) as { created_at: string } | undefined;
  if (!row || new Date(row.created_at).getTime() >= cutoff.getTime()) return null;
  return resolveSession(rawToken);
}

export function resolveSession(rawToken: string | undefined): User | null {
  if (!rawToken) return null;
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.id, u.handle, u.created_at, s.expires_at, u.is_blocked_platform
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as
    | { id: string; handle: string; created_at: string; expires_at: string; is_blocked_platform: number }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  if (row.is_blocked_platform) return null;

  return { id: row.id, handle: row.handle, createdAt: row.created_at };
}

export function destroySession(rawToken: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(rawToken));
}
