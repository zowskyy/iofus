"use server";

import { redirect } from "next/navigation";
import { consumeResetToken, PasswordResetError } from "@/lib/passwordReset";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";

export interface ResetState {
  error?: string;
}

export async function resetPasswordAction(token: string, _prev: ResetState, formData: FormData): Promise<ResetState> {
  const key = await rateLimitActorKey("resetPassword", null);
  try {
    checkRateLimit(key, 10);
  } catch (e) {
    if (e instanceof RateLimitError) return { error: "Too many attempts. Try again later." };
    throw e;
  }

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) return { error: "Passwords do not match." };

  try {
    consumeResetToken(token, password);
  } catch (err) {
    if (err instanceof PasswordResetError) return { error: err.message };
    console.error("[resetPasswordAction] unexpected error", err);
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/login?reset=1");
}
