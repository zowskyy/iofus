import { createTransport } from "nodemailer";
import type { EnvLike } from "./productionConfig";

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Thrown when mail is requested but no transport is configured to deliver it. */
export class MailConfigurationError extends Error {}

/**
 * Transport options for *host*. Exported so the TLS posture is testable without
 * opening a connection.
 *
 * `requireTLS` matters because nodemailer otherwise only issues STARTTLS when
 * the server advertises it, and silently continues in plaintext when it does
 * not (see its smtp-connection: STARTTLS is sent when the EHLO response
 * advertises it *or* requireTLS is set). These messages carry password-reset
 * tokens, so in production the connection must fail rather than downgrade.
 * Left off outside production, where a local mail catcher usually has no TLS
 * at all.
 */
export function smtpTransportOptions(host: string, env: EnvLike = process.env) {
  return {
    host,
    port: Number(env.IOFUS_SMTP_PORT ?? 587),
    // Implicit TLS (usually port 465); requireTLS covers the STARTTLS path.
    secure: env.IOFUS_SMTP_SECURE === "true",
    requireTLS: env.NODE_ENV === "production",
    auth: env.IOFUS_SMTP_USER
      ? { user: env.IOFUS_SMTP_USER, pass: env.IOFUS_SMTP_PASS ?? "" }
      : undefined,
  };
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const host = process.env.IOFUS_SMTP_HOST;

  if (!host) {
    if (process.env.NODE_ENV === "production") {
      // These bodies carry live password-reset tokens. Printing them to the
      // container log would put working credentials into log aggregation while
      // the UI told the user their mail was on its way, so fail instead of
      // reporting a delivery that did not happen. The boot gate normally stops
      // the server long before this; this is the second line of defence.
      throw new MailConfigurationError(
        "IOFUS_SMTP_HOST is not configured — refusing to discard an email containing a credential.",
      );
    }
    console.log("[mailer] IOFUS_SMTP_HOST not set — printing email to console instead");
    console.log(`[mailer] TO: ${opts.to}`);
    console.log(`[mailer] SUBJECT: ${opts.subject}`);
    console.log(`[mailer] BODY:\n${opts.text}`);
    return;
  }

  const transport = createTransport(smtpTransportOptions(host));

  await transport.sendMail({
    from: process.env.IOFUS_SMTP_FROM ?? `noreply@${host}`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
