"use server";

import { redirect } from "next/navigation";
import { createUser, HandleTakenError, ValidationError } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { defaultPageDocument, savePageDocument } from "@/lib/pageDocument";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { logIn } from "@/lib/session";

export interface SignupState {
  error?: string;
}

export async function signupAction(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const handle = String(formData.get("handle") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || handle;

  const key = await rateLimitActorKey("signup", null);
  try {
    checkRateLimit(key, 5);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return { error: "Too many sign-up attempts from this connection. Wait a minute and try again." };
    }
    throw e;
  }

  // Account creation and the starter page are wrapped in one transaction:
  // without this, a failure between the two (e.g. a DB error saving the
  // page document) left a user row committed with no page and no session —
  // a half-created account the only way out of which was /login, since the
  // handle was now permanently taken. Rolling both back together means a
  // failed signup is simply retryable from scratch.
  let userId: string;
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const user = createUser(handle, password);
    userId = user.id;
    // A brand-new account gets a real, valid, unpublished starter page
    // immediately — never a null/undefined state that the rest of the app
    // has to special-case.
    savePageDocument(userId, defaultPageDocument(displayName));
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already resolved */
    }
    if (e instanceof ValidationError || e instanceof HandleTakenError) {
      return { error: e.message };
    }
    throw e;
  }

  await logIn(userId);
  redirect("/make");
}
