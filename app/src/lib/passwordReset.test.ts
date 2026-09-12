import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, createUser, InvalidCredentialsError } from "./auth";
import { resetDbForTests, getDb } from "./db";
import {
  consumeResetToken,
  getUserEmail,
  PasswordResetError,
  requestPasswordReset,
  setUserEmail,
  verifyResetToken,
} from "./passwordReset";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
  vi.restoreAllMocks();
});

const PASSWORD = "correct-horse-battery";
const BASE = "https://iofus.example";

/**
 * The reset link is only ever delivered by email, so tests read the token out
 * of the message body the same way a user would read it out of their inbox.
 */
async function requestAndCaptureToken(emailOrHandle: string): Promise<string | null> {
  const logged: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
    logged.push(args.join(" "));
  });
  await requestPasswordReset(emailOrHandle, BASE);
  spy.mockRestore();

  const match = logged.join("\n").match(/reset-password\/([0-9a-f]{64})/);
  return match?.[1] ?? null;
}

async function userWithEmail(handle: string, email: string) {
  const user = await createUser(handle, PASSWORD);
  setUserEmail(user.id, email);
  return user;
}

describe("password reset end to end", () => {
  it("lets the user log in with the new password afterwards", async () => {
    // The regression this pins: consumeResetToken hashed with the salt as a hex
    // *string* while authenticate verified with the salt as raw *bytes*, so the
    // new password never matched. Resetting locked the account out permanently,
    // and because reset also deletes every session there was no way back in.
    const user = await userWithEmail("voidarcade", "void@example.com");
    const token = await requestAndCaptureToken("voidarcade");
    expect(token).toBeTruthy();

    await consumeResetToken(token!, "a-brand-new-password");

    const loggedIn = await authenticate("voidarcade", "a-brand-new-password");
    expect(loggedIn.id).toBe(user.id);
  });

  it("rejects the old password after a reset", async () => {
    await userWithEmail("voidarcade", "void@example.com");
    const token = await requestAndCaptureToken("voidarcade");
    await consumeResetToken(token!, "a-brand-new-password");

    await expect(authenticate("voidarcade", PASSWORD)).rejects.toThrow(InvalidCredentialsError);
  });

  it("can be driven by email address as well as handle", async () => {
    await userWithEmail("voidarcade", "void@example.com");
    const token = await requestAndCaptureToken("void@example.com");
    expect(token).toBeTruthy();
    await consumeResetToken(token!, "another-new-password");
    await expect(authenticate("voidarcade", "another-new-password")).resolves.toBeDefined();
  });
});

describe("reset tokens", () => {
  it("can only be used once", async () => {
    await userWithEmail("voidarcade", "void@example.com");
    const token = await requestAndCaptureToken("voidarcade");

    await consumeResetToken(token!, "first-new-password");
    await expect(consumeResetToken(token!, "second-new-password")).rejects.toThrow(PasswordResetError);

    // The second attempt must not have taken effect.
    await expect(authenticate("voidarcade", "first-new-password")).resolves.toBeDefined();
  });

  it("is rejected once expired", async () => {
    const user = await userWithEmail("voidarcade", "void@example.com");
    const token = await requestAndCaptureToken("voidarcade");

    getDb()
      .prepare("UPDATE password_reset_tokens SET expires_at = ? WHERE user_id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), user.id);

    await expect(consumeResetToken(token!, "too-late-password")).rejects.toThrow(PasswordResetError);
    await expect(authenticate("voidarcade", PASSWORD)).resolves.toBeDefined();
  });

  it("rejects an unknown token", async () => {
    await expect(consumeResetToken("f".repeat(64), "whatever-password")).rejects.toThrow(PasswordResetError);
  });

  it("invalidates any earlier token when a new one is requested", async () => {
    await userWithEmail("voidarcade", "void@example.com");
    const first = await requestAndCaptureToken("voidarcade");
    const second = await requestAndCaptureToken("voidarcade");
    expect(first).not.toBe(second);

    await expect(consumeResetToken(first!, "using-old-token")).rejects.toThrow(PasswordResetError);
  });

  it("verifyResetToken reports validity without consuming the token", async () => {
    const user = await userWithEmail("voidarcade", "void@example.com");
    const token = await requestAndCaptureToken("voidarcade");

    expect(verifyResetToken(token!)).toBe(user.id);
    expect(verifyResetToken(token!)).toBe(user.id);
    expect(verifyResetToken("a".repeat(64))).toBeNull();
  });

  it("signs the user out everywhere after a reset", async () => {
    const user = await userWithEmail("voidarcade", "void@example.com");
    getDb()
      .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run("deadbeef", user.id, new Date().toISOString(), new Date(Date.now() + 86400000).toISOString());

    const token = await requestAndCaptureToken("voidarcade");
    await consumeResetToken(token!, "a-brand-new-password");

    const remaining = getDb()
      .prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?")
      .get(user.id) as { n: number };
    expect(remaining.n).toBe(0);
  });

  it("enforces a minimum new-password length", async () => {
    await userWithEmail("voidarcade", "void@example.com");
    const token = await requestAndCaptureToken("voidarcade");
    await expect(consumeResetToken(token!, "short")).rejects.toThrow(PasswordResetError);
  });
});

describe("account enumeration", () => {
  it("does not throw or issue a token for an unknown handle", async () => {
    const token = await requestAndCaptureToken("nobody-at-all");
    expect(token).toBeNull();
  });

  it("does not issue a token for an account with no email on file", async () => {
    await createUser("voidarcade", PASSWORD);
    expect(getUserEmail((await createUser("otheruser", PASSWORD)).id)).toBeNull();
    const token = await requestAndCaptureToken("voidarcade");
    expect(token).toBeNull();
  });
});

describe("email uniqueness", () => {
  it("rejects an address already claimed by another account", async () => {
    await userWithEmail("voidarcade", "shared@example.com");
    const other = await createUser("neonorchard", PASSWORD);
    expect(() => setUserEmail(other.id, "shared@example.com")).toThrow(PasswordResetError);
  });

  it("compares case-insensitively", async () => {
    await userWithEmail("voidarcade", "shared@example.com");
    const other = await createUser("neonorchard", PASSWORD);
    expect(() => setUserEmail(other.id, "SHARED@Example.com")).toThrow(PasswordResetError);
  });

  it("lets an account re-set its own address", async () => {
    const user = await userWithEmail("voidarcade", "mine@example.com");
    expect(() => setUserEmail(user.id, "mine@example.com")).not.toThrow();
  });

  it("is enforced by a database constraint, not only the upfront check", async () => {
    // Bypasses setUserEmail entirely, the way a racing second writer would
    // once both had passed the check-then-act query.
    const a = await userWithEmail("voidarcade", "shared@example.com");
    const b = await createUser("neonorchard", PASSWORD);
    expect(() =>
      getDb().prepare("UPDATE users SET email = ? WHERE id = ?").run("shared@example.com", b.id),
    ).toThrow();
    expect(getUserEmail(a.id)).toBe("shared@example.com");
  });

  it("still allows many accounts without an email", async () => {
    const a = await createUser("usera", PASSWORD);
    const b = await createUser("userb", PASSWORD);
    expect(getUserEmail(a.id)).toBeNull();
    expect(getUserEmail(b.id)).toBeNull();
  });
});
