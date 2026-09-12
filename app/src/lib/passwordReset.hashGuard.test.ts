import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Password hashing is deliberately slow and runs in a small global queue shared
 * with login and signup. A reset submission that carries a token already known
 * to be invalid, expired or used must be rejected before it reaches that queue,
 * or stale reset forms could occupy every slot and stall real sign-ins.
 *
 * Proving an ordering needs its own file: hashPassword is replaced with one
 * that throws, so if it were ever reached the test would see that error instead
 * of the expected PasswordResetError.
 */
vi.mock("./auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth")>();
  return {
    ...actual,
    hashPassword: vi.fn(async () => {
      throw new Error("hashPassword was reached for a token that should have been rejected first");
    }),
  };
});

const { consumeResetToken, PasswordResetError, setUserEmail } = await import("./passwordReset");
const { createUserWithPasswordHash } = await import("./auth");
const { resetDbForTests, getDb } = await import("./db");

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
});

/** Creates an account without going through the mocked hashing path. */
function accountWithEmail(handle: string, email: string) {
  const user = createUserWithPasswordHash(handle, "scrypt$10$8$1$aa$bb");
  setUserEmail(user.id, email);
  return user;
}

function insertToken(userId: string, tokenHash: string, expiresAt: Date) {
  getDb()
    .prepare(
      "INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .run(tokenHash, userId, new Date().toISOString(), expiresAt.toISOString());
}

describe("consumeResetToken rejects before hashing", () => {
  it("does not hash for a token that does not exist", async () => {
    await expect(consumeResetToken("f".repeat(64), "a-brand-new-password")).rejects.toThrow(
      PasswordResetError,
    );
  });

  it("does not hash for an expired token", async () => {
    const user = accountWithEmail("voidarcade", "void@example.com");
    // hashToken is not exported, so the row is written under the same digest
    // the module computes for this token (a plain sha256 of the token).
    const { createHash } = await import("node:crypto");
    const token = "a".repeat(64);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    insertToken(user.id, tokenHash, new Date(Date.now() - 1000));

    await expect(consumeResetToken(token, "a-brand-new-password")).rejects.toThrow(
      /expired/i,
    );
  });

  it("still rejects a short password before anything else", async () => {
    await expect(consumeResetToken("f".repeat(64), "short")).rejects.toThrow(PasswordResetError);
  });
});
