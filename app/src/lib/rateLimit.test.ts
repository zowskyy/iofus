import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "./db";
import { checkRateLimit, RateLimitError, resolveClientIp } from "./rateLimit";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const key = "report:test-user";
    expect(() => {
      for (let i = 0; i < 5; i++) checkRateLimit(key, 5);
    }).not.toThrow();
  });

  it("rejects when the limit is exceeded within the window", () => {
    const key = "report:test-user";
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5);
    expect(() => checkRateLimit(key, 5)).toThrow(RateLimitError);
  });

  it("uses separate counters per key", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("report:a", 5);
    expect(() => checkRateLimit("report:b", 5)).not.toThrow();
  });

  it("includes retry-after seconds on rate limit errors", () => {
    const key = "guestbook:anon";
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3);
    try {
      checkRateLimit(key, 3);
      expect.fail("expected RateLimitError");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("never allows more than maxCount successes under concurrent requests", async () => {
    const key = "login:concurrent-test";
    const maxCount = 5;
    const attempts = 20;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () => Promise.resolve().then(() => checkRateLimit(key, maxCount))),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof RateLimitError,
    ).length;

    expect(succeeded).toBe(maxCount);
    expect(rejected).toBe(attempts - maxCount);
  });
});

describe("resolveClientIp", () => {
  it("reads the client from the right, not the forgeable left edge", () => {
    // client -> Cloudflare -> Render: one trusted proxy appended after the client.
    expect(resolveClientIp("203.0.113.9, 172.16.0.1", 1)).toBe("203.0.113.9");
  });

  it("ignores entries an attacker prepends", () => {
    // The client sent its own X-Forwarded-For claiming to be 1.2.3.4. The
    // proxy chain appended the real address and its own, so counting from the
    // right still lands on the real client regardless of how much was forged.
    expect(resolveClientIp("1.2.3.4, 203.0.113.9, 172.16.0.1", 1)).toBe("203.0.113.9");
    expect(resolveClientIp("9.9.9.9, 8.8.8.8, 1.2.3.4, 203.0.113.9, 172.16.0.1", 1)).toBe(
      "203.0.113.9",
    );
  });

  it("does not collapse distinct visitors onto the proxy address", () => {
    // The regression this fixes: taking the rightmost entry returned the same
    // edge IP for everyone, so every anonymous visitor shared one bucket.
    const a = resolveClientIp("203.0.113.9, 172.16.0.1", 1);
    const b = resolveClientIp("198.51.100.7, 172.16.0.1", 1);
    expect(a).not.toBe(b);
  });

  it("supports a direct connection with no proxy in front", () => {
    expect(resolveClientIp("203.0.113.9", 0)).toBe("203.0.113.9");
  });

  it("supports multiple trusted hops", () => {
    expect(resolveClientIp("203.0.113.9, 172.16.0.1, 10.0.0.5", 2)).toBe("203.0.113.9");
  });

  it("fails closed when the header is missing", () => {
    expect(resolveClientIp(null, 1)).toBeNull();
    expect(resolveClientIp(undefined, 1)).toBeNull();
    expect(resolveClientIp("", 1)).toBeNull();
  });

  it("fails closed when there are fewer entries than configured hops", () => {
    // Only the proxy's own entry is present, so no entry represents a client.
    expect(resolveClientIp("172.16.0.1", 1)).toBeNull();
    expect(resolveClientIp("172.16.0.1, 10.0.0.5", 2)).toBeNull();
  });

  it("tolerates whitespace and empty segments", () => {
    expect(resolveClientIp("  203.0.113.9 ,  172.16.0.1  ", 1)).toBe("203.0.113.9");
    expect(resolveClientIp("203.0.113.9, , 172.16.0.1", 1)).toBe("203.0.113.9");
  });
});
