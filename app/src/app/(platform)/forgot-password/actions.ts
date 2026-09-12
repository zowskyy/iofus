"use server";

import { requestPasswordReset } from "@/lib/passwordReset";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";

export interface ForgotState {
  sent?: boolean;
  error?: string;
}

export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const emailOrHandle = String(formData.get("emailOrHandle") ?? "").trim();
  if (!emailOrHandle) return { error: "Enter your handle or email address." };

  // Rate-limit by IP before doing any work (anonymous endpoint, so userId is null).
  const key = await rateLimitActorKey("passwordReset", null);
  try {
    checkRateLimit(key, 5);
  } catch (e) {
    if (e instanceof RateLimitError) return { sent: true }; // silent — don't reveal limiting
    throw e;
  }

  // Build the reset URL from the configured canonical origin, never from request
  // headers — host headers are attacker-controlled and could redirect the token
  // to an attacker's server.
  const origin = process.env.IOFUS_ALLOWED_ORIGIN
    ? `https://${process.env.IOFUS_ALLOWED_ORIGIN}`
    : "http://localhost:3000";

  try {
    await requestPasswordReset(emailOrHandle, origin);
  } catch (err) {
    console.error("[forgotPasswordAction] unexpected error", err);
    // Return success to avoid leaking info about why it failed.
  }

  // Always show "sent" — never confirm whether the account or email exists.
  return { sent: true };
}
