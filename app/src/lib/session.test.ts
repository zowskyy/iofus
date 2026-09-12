import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal stand-in for Next's cookie jar, recording what the app sets. */
class FakeJar {
  store = new Map<string, { value: string; options?: Record<string, unknown> }>();
  set(name: string, value: string, options?: Record<string, unknown>) {
    this.store.set(name, { value, options });
  }
  get(name: string) {
    const entry = this.store.get(name);
    return entry ? { name, value: entry.value } : undefined;
  }
  delete(name: string) {
    this.store.delete(name);
  }
  optionsFor(name: string) {
    return this.store.get(name)?.options;
  }
}

let jar: FakeJar;

vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

const { getCurrentUser, logIn, logOut } = await import("./session");
const { createUser, createSession, resolveSession } = await import("./auth");
const { resetDbForTests } = await import("./db");

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
  jar = new FakeJar();
  vi.unstubAllEnvs();
});

const PASSWORD = "correct-horse-battery";

describe("logIn cookie hardening", () => {
  it("marks the session cookie httpOnly, lax and site-wide", async () => {
    const user = await createUser("voidarcade", PASSWORD);
    await logIn(user.id);

    const options = jar.optionsFor("iofus_session")!;
    // httpOnly is what keeps the token out of reach of any script on a page,
    // which matters especially on a platform hosting user-authored content.
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(30 * 24 * 60 * 60);
  });

  it("does not store the raw token anywhere readable in the database", async () => {
    const user = await createUser("voidarcade", PASSWORD);
    await logIn(user.id);
    const token = jar.get("iofus_session")!.value;

    const { getDb } = await import("./db");
    const row = getDb()
      .prepare("SELECT token_hash FROM sessions WHERE user_id = ?")
      .get(user.id) as { token_hash: string };
    expect(row.token_hash).not.toBe(token);
  });

  it("issues a different token on each login", async () => {
    const user = await createUser("voidarcade", PASSWORD);
    await logIn(user.id);
    const first = jar.get("iofus_session")!.value;
    await logIn(user.id);
    const second = jar.get("iofus_session")!.value;
    expect(first).not.toBe(second);
  });

  it("uses the __Host- prefixed, Secure cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const user = await createUser("voidarcade", PASSWORD);
    await logIn(user.id);

    const options = jar.optionsFor("__Host-iofus_session")!;
    expect(options).toBeDefined();
    // __Host- is only honoured by browsers when all three hold.
    expect(options.secure).toBe(true);
    expect(options.path).toBe("/");
    expect(options.domain).toBeUndefined();
  });
});

describe("getCurrentUser", () => {
  it("resolves the signed-in user from the cookie", async () => {
    const user = await createUser("voidarcade", PASSWORD);
    await logIn(user.id);
    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("returns null with no cookie at all", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("rejects a forged cookie value", async () => {
    await createUser("voidarcade", PASSWORD);
    jar.set("iofus_session", "f".repeat(64));
    expect(await getCurrentUser()).toBeNull();
  });

  it("still accepts a session issued under the pre-prefix cookie name", async () => {
    // A deploy that introduced the prefix must not sign everybody out. Only
    // sessions predating the migration qualify -- see the cutoff tests below.
    const user = await createUser("voidarcade", PASSWORD);
    const token = createSession(user.id);
    const { createHash } = await import("node:crypto");
    const { getDb } = await import("./db");
    getDb()
      .prepare("UPDATE sessions SET created_at = ? WHERE token_hash = ?")
      .run(
        "2026-01-01T00:00:00.000Z",
        createHash("sha256").update("iofus-session-salt-v1").update(token).digest("hex"),
      );
    jar.set("iofus_session", token);
    vi.stubEnv("NODE_ENV", "production");
    expect((await getCurrentUser())?.id).toBe(user.id);
  });
});

describe("logOut", () => {
  it("invalidates the token server-side, not just in the browser", async () => {
    const user = await createUser("voidarcade", PASSWORD);
    await logIn(user.id);
    const token = jar.get("iofus_session")!.value;

    await logOut();

    // Clearing the cookie alone would leave a captured token usable.
    expect(resolveSession(token)).toBeNull();
    expect(jar.get("iofus_session")).toBeUndefined();
    expect(await getCurrentUser()).toBeNull();
  });

  it("is safe to call when nobody is signed in", async () => {
    await expect(logOut()).resolves.toBeUndefined();
  });
});

describe("legacy cookie migration window", () => {
  /** Backdates a session so it looks like one issued before the __Host- migration. */
  async function backdateSession(token: string, iso: string) {
    const { createHash } = await import("node:crypto");
    const { getDb } = await import("./db");
    const hash = createHash("sha256").update("iofus-session-salt-v1").update(token).digest("hex");
    getDb().prepare("UPDATE sessions SET created_at = ? WHERE token_hash = ?").run(iso, hash);
  }

  it("rejects a legacy cookie naming a session created after the cutoff", async () => {
    // The attack the __Host- prefix exists to stop: a sibling subdomain sets a
    // parent-domain iofus_session cookie. It can only name a session it just
    // created, so anything newer than the cutoff must not be honoured.
    const user = await createUser("voidarcade", PASSWORD);
    const token = createSession(user.id); // created now, i.e. after the cutoff
    jar.set("iofus_session", token);
    vi.stubEnv("NODE_ENV", "production");

    expect(await getCurrentUser()).toBeNull();
  });

  it("still accepts a legacy cookie for a session issued before the cutoff", async () => {
    const user = await createUser("voidarcade", PASSWORD);
    const token = createSession(user.id);
    await backdateSession(token, "2026-01-01T00:00:00.000Z");
    jar.set("iofus_session", token);
    vi.stubEnv("NODE_ENV", "production");

    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("prefers the prefixed cookie and never falls back when it is present", async () => {
    const victim = await createUser("victim", PASSWORD);
    const attacker = await createUser("attacker", PASSWORD);
    vi.stubEnv("NODE_ENV", "production");

    jar.set("__Host-iofus_session", createSession(victim.id));
    jar.set("iofus_session", createSession(attacker.id));

    expect((await getCurrentUser())?.id).toBe(victim.id);
  });
});
