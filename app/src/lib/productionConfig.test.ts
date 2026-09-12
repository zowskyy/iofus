import { describe, expect, it } from "vitest";
import {
  dbPathIsPersistent,
  parseProxyHops,
  ProductionConfigError,
  productionConfigProblems,
  validateProductionConfig,
  type ConfigDeps,
  type EnvLike,
} from "./productionConfig";

/** Pretends the DB directory is a mounted volume (different device than `/`). */
const mountedDisk: ConfigDeps = {
  deviceIdOf: (path) => (path === "/" ? 1 : 2),
};

/** Pretends the DB directory is on the container's own ephemeral layer. */
const ephemeralLayer: ConfigDeps = {
  deviceIdOf: () => 1,
};

/** A fully valid production environment; individual tests break one thing at a time. */
function validEnv(): EnvLike {
  return {
    NODE_ENV: "production",
    IOFUS_SMTP_HOST: "smtp.example.com",
    IOFUS_ALLOWED_ORIGIN: "iofus.example",
    IOFUS_MODERATOR_HANDLE: "mod",
    IOFUS_TRUSTED_PROXY_HOPS: "1",
    IOFUS_DB_PATH: "/data/iofus.db",
  };
}

describe("productionConfigProblems", () => {
  it("reports nothing for a fully configured production environment", () => {
    expect(productionConfigProblems(validEnv(), mountedDisk)).toEqual([]);
  });

  // Each required variable is independently fatal — a single missing one must
  // be caught even when everything else is correct.
  const required = [
    "IOFUS_SMTP_HOST",
    "IOFUS_ALLOWED_ORIGIN",
    "IOFUS_MODERATOR_HANDLE",
    "IOFUS_TRUSTED_PROXY_HOPS",
    "IOFUS_DB_PATH",
  ] as const;

  for (const key of required) {
    it(`reports a problem when ${key} is missing`, () => {
      const env = validEnv();
      delete env[key];
      const problems = productionConfigProblems(env, mountedDisk);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(key);
    });

    it(`treats a whitespace-only ${key} as missing`, () => {
      const env = validEnv();
      env[key] = "   ";
      expect(productionConfigProblems(env, mountedDisk)).toHaveLength(1);
    });
  }

  it("rejects IOFUS_AUTO_MODERATOR_SEED in production", () => {
    const env = { ...validEnv(), IOFUS_AUTO_MODERATOR_SEED: "true" };
    const problems = productionConfigProblems(env, mountedDisk);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("IOFUS_AUTO_MODERATOR_SEED");
  });

  it("rejects IOFUS_DISABLE_RATE_LIMIT in production", () => {
    const env = { ...validEnv(), IOFUS_DISABLE_RATE_LIMIT: "true" };
    const problems = productionConfigProblems(env, mountedDisk);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("IOFUS_DISABLE_RATE_LIMIT");
  });

  it("rejects a database on the ephemeral container layer", () => {
    const problems = productionConfigProblems(validEnv(), ephemeralLayer);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("ephemeral");
  });

  it("allows an ephemeral database only when explicitly acknowledged", () => {
    const env = { ...validEnv(), IOFUS_ACK_EPHEMERAL_DB: "true" };
    expect(productionConfigProblems(env, ephemeralLayer)).toEqual([]);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const problems = productionConfigProblems({ NODE_ENV: "production" }, ephemeralLayer);
    expect(problems.length).toBeGreaterThanOrEqual(5);
  });
});

describe("parseProxyHops", () => {
  it("accepts zero and positive integers", () => {
    expect(parseProxyHops("0")).toBe(0);
    expect(parseProxyHops("2")).toBe(2);
    expect(parseProxyHops(" 3 ")).toBe(3);
  });

  it("rejects absent, empty, negative, fractional, and non-numeric values", () => {
    for (const raw of [undefined, "", "   ", "-1", "1.5", "one", "1x"]) {
      expect(parseProxyHops(raw)).toBeNull();
    }
  });
});

describe("dbPathIsPersistent", () => {
  it("is true when the database directory is a separate device", () => {
    expect(dbPathIsPersistent("/data/iofus.db", mountedDisk)).toBe(true);
  });

  it("is false when the database shares the root device", () => {
    expect(dbPathIsPersistent("/app/iofus.db", ephemeralLayer)).toBe(false);
  });

  it("fails closed when the path cannot be stat'd", () => {
    expect(dbPathIsPersistent("/nope/iofus.db", { deviceIdOf: () => null })).toBe(false);
  });
});

describe("validateProductionConfig", () => {
  it("throws with every problem listed when production is misconfigured", () => {
    expect(() => validateProductionConfig({ NODE_ENV: "production" }, ephemeralLayer)).toThrow(
      ProductionConfigError,
    );
  });

  it("does not throw for a valid production environment", () => {
    expect(() => validateProductionConfig(validEnv(), mountedDisk)).not.toThrow();
  });

  it("is a no-op outside production, so local dev needs no configuration", () => {
    expect(() => validateProductionConfig({ NODE_ENV: "development" }, ephemeralLayer)).not.toThrow();
    expect(() => validateProductionConfig({ NODE_ENV: "test" }, ephemeralLayer)).not.toThrow();
  });
});

describe("cleartext origins", () => {
  it("rejects an http:// canonical origin in production", () => {
    // Reset links carry a credential, and the session cookie is Secure, so an
    // http origin is both an interception risk and simply broken.
    const env = { ...validEnv(), IOFUS_ALLOWED_ORIGIN: "http://iofus.example" };
    const problems = productionConfigProblems(env, mountedDisk);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("cleartext");
  });

  it("rejects it case-insensitively", () => {
    const env = { ...validEnv(), IOFUS_ALLOWED_ORIGIN: "HTTP://iofus.example" };
    expect(productionConfigProblems(env, mountedDisk)).toHaveLength(1);
  });

  it("accepts https:// and a bare host", () => {
    for (const origin of ["https://iofus.example", "iofus.example"]) {
      const env = { ...validEnv(), IOFUS_ALLOWED_ORIGIN: origin };
      expect(productionConfigProblems(env, mountedDisk)).toEqual([]);
    }
  });

  it("does not mistake a host starting with 'http' for a cleartext origin", () => {
    const env = { ...validEnv(), IOFUS_ALLOWED_ORIGIN: "httpbin.example" };
    expect(productionConfigProblems(env, mountedDisk)).toEqual([]);
  });
});
