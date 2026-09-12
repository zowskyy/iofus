import { beforeEach, describe, expect, it } from "vitest";
import {
  authenticate,
  createSession,
  createUser,
  destroySession,
  HandleTakenError,
  InvalidCredentialsError,
  resolveSession,
  validateHandle,
  validatePassword,
  ValidationError,
} from "./auth";
import { resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
});

describe("validateHandle", () => {
  it("accepts a normal handle", async () => {
    expect(validateHandle("voidarcade")).toBe("voidarcade");
  });

  it("lowercases the handle", async () => {
    expect(validateHandle("VoidArcade")).toBe("voidarcade");
  });

  it("rejects a handle that's too short", async () => {
    expect(() => validateHandle("a")).toThrow(ValidationError);
  });

  it("rejects a handle starting with a hyphen", async () => {
    expect(() => validateHandle("-void")).toThrow(ValidationError);
  });

  it("rejects spaces", async () => {
    expect(() => validateHandle("void arcade")).toThrow(ValidationError);
  });

  it("rejects a handle with a slash (path-injection shaped input)", async () => {
    expect(() => validateHandle("void/../admin")).toThrow(ValidationError);
  });

  it("rejects reserved handles", async () => {
    expect(() => validateHandle("explore")).toThrow(ValidationError);
    expect(() => validateHandle("ADMIN")).toThrow(ValidationError);
  });

  it("rejects a handle over 30 characters", async () => {
    expect(() => validateHandle("a".repeat(31))).toThrow(ValidationError);
  });
});

describe("validatePassword", () => {
  it("accepts a reasonable password", async () => {
    expect(() => validatePassword("correct-horse-battery")).not.toThrow();
  });

  it("rejects a short password", async () => {
    expect(() => validatePassword("short")).toThrow(ValidationError);
  });

  it("rejects an absurdly long password (DoS-shaped input)", async () => {
    expect(() => validatePassword("a".repeat(1000))).toThrow(ValidationError);
  });
});

describe("createUser", () => {
  it("creates a user with a valid handle and password", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    expect(user.handle).toBe("voidarcade");
    expect(user.id).toBeTruthy();
  });

  it("rejects a duplicate handle regardless of case", async () => {
    await createUser("voidarcade", "correct-horse-battery");
    await expect(createUser("VoidArcade", "another-password")).rejects.toThrow(HandleTakenError);
  });

  it("rejects an invalid handle before touching the database", async () => {
    await expect(createUser("a", "correct-horse-battery")).rejects.toThrow(ValidationError);
  });
});

describe("authenticate", () => {
  it("authenticates with the correct password", async () => {
    await createUser("voidarcade", "correct-horse-battery");
    const user = await authenticate("voidarcade", "correct-horse-battery");
    expect(user.handle).toBe("voidarcade");
  });

  it("is case-insensitive on handle", async () => {
    await createUser("voidarcade", "correct-horse-battery");
    await expect(authenticate("VoidArcade", "correct-horse-battery")).resolves.toBeDefined();
  });

  it("rejects the wrong password", async () => {
    await createUser("voidarcade", "correct-horse-battery");
    await expect(authenticate("voidarcade", "wrong-password")).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects a nonexistent handle with the same error as a wrong password (no account-existence leak)", async () => {
    await expect(authenticate("nobody-here", "whatever")).rejects.toThrow(InvalidCredentialsError);
  });
});

describe("sessions", () => {
  it("resolves a valid session token to the right user", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    const token = createSession(user.id);
    const resolved = resolveSession(token);
    expect(resolved?.id).toBe(user.id);
  });

  it("returns null for a garbage token", async () => {
    expect(resolveSession("not-a-real-token")).toBeNull();
  });

  it("returns null for an undefined token (no cookie present)", async () => {
    expect(resolveSession(undefined)).toBeNull();
  });

  it("returns null after the session is destroyed", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    const token = createSession(user.id);
    destroySession(token);
    expect(resolveSession(token)).toBeNull();
  });

  it("destroying an already-destroyed session is a no-op, not an error", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    const token = createSession(user.id);
    destroySession(token);
    expect(() => destroySession(token)).not.toThrow();
  });
});
