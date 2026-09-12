import { createTransport } from "nodemailer";

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const host = process.env.IOFUS_SMTP_HOST;

  if (!host) {
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
