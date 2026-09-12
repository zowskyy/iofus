import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./auth";
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

export async function consumeResetToken(token: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 8) throw new PasswordResetError("Password must be at least 8 characters.");

  const tokenHash = hashToken(token);
  const db = getDb();

  // Hashed before the transaction opens. BEGIN IMMEDIATE takes the write lock,
  // and a deliberately slow KDF must not be run while holding it.
  const passwordHash = await hashPassword(newPassword);

  // All checks and writes happen inside a single BEGIN IMMEDIATE transaction
  // so concurrent submissions of the same token cannot both observe it as
  // valid and both succeed. The first to commit deletes the token; the second
  // will not find it and throws "invalid or already used."
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare("SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?")
      .get(tokenHash) as { user_id: string; expires_at: string } | undefined;

    if (!row) {
      db.exec("ROLLBACK");
      throw new PasswordResetError("This reset link is invalid or has already been used.");
    }
    if (new Date(row.expires_at) < new Date()) {
      db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
      db.exec("COMMIT");
      throw new PasswordResetError("This reset link has expired. Request a new one.");
    }

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
    db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
    // Invalidate all sessions so the compromised password can no longer be used.
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* already resolved */ }
    throw err;
  }
}
