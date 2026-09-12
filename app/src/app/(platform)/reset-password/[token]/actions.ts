"use server";

import { redirect } from "next/navigation";
import { consumeResetToken, PasswordResetError } from "@/lib/passwordReset";

export interface ResetState {
  error?: string;
}

export async function resetPasswordAction(token: string, _prev: ResetState, formData: FormData): Promise<ResetState> {
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
