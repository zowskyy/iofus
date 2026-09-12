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
    // A deploy that introduced the prefix must not sign everybody out.
    const user = await createUser("voidarcade", PASSWORD);
    jar.set("iofus_session", createSession(user.id));
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
