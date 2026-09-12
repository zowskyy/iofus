import { createTransport } from "nodemailer";

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Thrown when mail is requested but no transport is configured to deliver it. */
export class MailConfigurationError extends Error {}

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

  const transport = createTransport({
    host,
    port: Number(process.env.IOFUS_SMTP_PORT ?? 587),
    secure: process.env.IOFUS_SMTP_SECURE === "true",
    auth: process.env.IOFUS_SMTP_USER
      ? { user: process.env.IOFUS_SMTP_USER, pass: process.env.IOFUS_SMTP_PASS ?? "" }
      : undefined,
  });

  await transport.sendMail({
    from: process.env.IOFUS_SMTP_FROM ?? `noreply@${host}`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
