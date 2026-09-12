"use server";

import { headers } from "next/headers";
import { requestPasswordReset } from "@/lib/passwordReset";

export interface ForgotState {
  sent?: boolean;
  error?: string;
}

export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const emailOrHandle = String(formData.get("emailOrHandle") ?? "").trim();
  if (!emailOrHandle) return { error: "Enter your handle or email address." };

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  try {
    await requestPasswordReset(emailOrHandle, baseUrl);
  } catch (err) {
    console.error("[forgotPasswordAction] unexpected error", err);
    // Return success to avoid leaking info about why it failed.
  }

  // Always show "sent" — never confirm whether the account or email exists.
  return { sent: true };
}
