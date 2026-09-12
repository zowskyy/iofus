"use server";

import { redirect } from "next/navigation";
import { authenticate, InvalidCredentialsError } from "@/lib/auth";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { logIn } from "@/lib/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const handle = String(formData.get("handle") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const normalizedHandle = handle.trim().toLowerCase();
    // Per-IP:handle limit blocks single-IP brute force.
    // Per-handle global limit caps distributed brute force across many IPs.
    const key = await rateLimitActorKey("login", null);
    checkRateLimit(`${key}:${normalizedHandle}`, 10);
    checkRateLimit(`login:handle:${normalizedHandle}`, 50);
    const user = await authenticate(normalizedHandle, password);
    await logIn(user.id);
  } catch (e) {
    if (e instanceof InvalidCredentialsError) {
      return { error: e.message };
    }
    if (e instanceof RateLimitError) {
      return { error: "Too many login attempts. Wait a minute and try again." };
    }
    throw e;
  }

  redirect("/make");
}
