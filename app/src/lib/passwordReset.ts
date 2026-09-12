import { createHash, randomBytes, scryptSync } from "node:crypto";
import { getDb } from "./db";
import { sendMail } from "./mailer";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export class PasswordResetError extends Error {}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function setUserEmail(userId: string, email: string): void {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) throw new PasswordResetError("Enter a valid email address.");
  if (trimmed.length > 254) throw new PasswordResetError("Email address is too long.");

  const db = getDb();
  const conflict = db
    .prepare("SELECT id FROM users WHERE LOWER(email) = ? AND id != ?")
    .get(trimmed, userId);
  if (conflict) throw new PasswordResetError("That email is already in use.");

  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(trimmed, userId);
}

export function getUserEmail(userId: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string | null } | undefined;
  return row?.email ?? null;
}

export async function requestPasswordReset(emailOrHandle: string, baseUrl: string): Promise<void> {
  const normalized = emailOrHandle.trim().toLowerCase();
  const db = getDb();

  const user = db
    .prepare("SELECT id, email FROM users WHERE LOWER(email) = ? OR handle_lower = ?")
    .get(normalized, normalized) as { id: string; email: string | null } | undefined;

  // Always return without error to avoid user enumeration.
  if (!user?.email) return;

  // Invalidate any existing tokens for this user.
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(user.id);

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + TOKEN_TTL_MS);

  db.prepare(
    "INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(tokenHash, user.id, now.toISOString(), expires.toISOString());

  const resetUrl = `${baseUrl}/reset-password/${token}`;

  await sendMail({
    to: user.email,
    subject: "Reset your iofus password",
    text: [
      "Someone requested a password reset for your iofus account.",
      "",
      `Reset your password here (valid for 1 hour): ${resetUrl}`,
      "",
      "If you didn't request this, ignore this email — your password has not changed.",
    ].join("\n"),
    html: [
      "<p>Someone requested a password reset for your iofus account.</p>",
      `<p><a href="${resetUrl}">Reset your password</a> (valid for 1 hour)</p>`,
      "<p>If you didn't request this, ignore this email — your password has not changed.</p>",
    ].join(""),
  });
}

export function verifyResetToken(token: string): string | null {
  const tokenHash = hashToken(token);
  const db = getDb();
  const row = db
    .prepare("SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?")
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  return row.user_id;
}

export function consumeResetToken(token: string, newPassword: string): void {
  if (!newPassword || newPassword.length < 8) throw new PasswordResetError("Password must be at least 8 characters.");

  const tokenHash = hashToken(token);
  const db = getDb();
  const row = db
    .prepare("SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?")
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;

  if (!row) throw new PasswordResetError("This reset link is invalid or has already been used.");
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
    throw new PasswordResetError("This reset link has expired. Request a new one.");
  }

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(newPassword, salt, 64).toString("hex");
  const passwordHash = `${salt}:${hash}`;

  const db2 = getDb();
  db2.exec("BEGIN IMMEDIATE");
  try {
    db2.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
    db2.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
    // Invalidate all sessions so the compromised password can no longer be used.
    db2.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);
    db2.exec("COMMIT");
  } catch (err) {
    try { db2.exec("ROLLBACK"); } catch { /* already resolved */ }
    throw err;
  }
}
