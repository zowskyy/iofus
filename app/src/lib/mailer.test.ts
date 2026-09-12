import { describe, expect, it } from "vitest";
import { smtpTransportOptions } from "./mailer";

const HOST = "smtp.example.com";

describe("smtpTransportOptions", () => {
  it("requires TLS in production", () => {
    // Without this, nodemailer only issues STARTTLS when the server advertises
    // it and otherwise continues in plaintext -- putting password-reset tokens
    // on the wire in the clear.
    expect(smtpTransportOptions(HOST, { NODE_ENV: "production" }).requireTLS).toBe(true);
  });

  it("does not require TLS outside production", () => {
    // Local mail catchers generally offer no TLS at all.
    expect(smtpTransportOptions(HOST, { NODE_ENV: "development" }).requireTLS).toBe(false);
    expect(smtpTransportOptions(HOST, { NODE_ENV: "test" }).requireTLS).toBe(false);
  });

  it("defaults to the submission port and explicit TLS opt-in", () => {
    const options = smtpTransportOptions(HOST, {});
    expect(options.port).toBe(587);
    expect(options.secure).toBe(false);
  });

  it("honours an explicit port and implicit-TLS flag", () => {
    const options = smtpTransportOptions(HOST, {
      IOFUS_SMTP_PORT: "465",
      IOFUS_SMTP_SECURE: "true",
    });
    expect(options.port).toBe(465);
    expect(options.secure).toBe(true);
  });

  it("omits auth entirely when no user is configured", () => {
    expect(smtpTransportOptions(HOST, {}).auth).toBeUndefined();
  });

  it("passes credentials through when a user is configured", () => {
    const options = smtpTransportOptions(HOST, {
      IOFUS_SMTP_USER: "mailer",
      IOFUS_SMTP_PASS: "secret",
    });
    expect(options.auth).toEqual({ user: "mailer", pass: "secret" });
  });

  it("tolerates a user configured without a password", () => {
    const options = smtpTransportOptions(HOST, { IOFUS_SMTP_USER: "mailer" });
    expect(options.auth).toEqual({ user: "mailer", pass: "" });
  });
});
