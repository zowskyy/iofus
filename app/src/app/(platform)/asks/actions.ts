"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  answerAsk,
  AskError,
  closeAsk,
  createAsk,
  setReachableForAsks,
} from "@/lib/asks";
import { getDb } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface AskActionState {
  error?: string;
  success?: string;
}

/** Maps AskError and RateLimitError to user-facing state; re-throws anything else. */
function handleAskError(e: unknown): never | AskActionState {
  if (e instanceof AskError) return { error: e.message };
  if (e instanceof RateLimitError) return { error: e.message };
  throw e;
}

/** Server action: validate and submit a new ask for the signed-in viewer. */
export async function createAskAction(
  _prevState: AskActionState,
  formData: FormData,
): Promise<AskActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/asks");

  const body = String(formData.get("body") ?? "");
  const domain = String(formData.get("domain") ?? "").trim() || undefined;
  const isAnonymous = formData.get("anonymous") === "on";
  const isSensitive = formData.get("sensitive") === "on";

  try {
    createAsk({ askerId: viewer.id, body, domain, isAnonymous, isSensitive });
  } catch (e) {
    return handleAskError(e);
  }

  revalidatePath("/asks");
  revalidatePath("/asks/mine");
  return { success: "Your ask is posted." };
}

/** Server action: submit an answer to *askId* from the signed-in viewer. */
export async function answerAskAction(
  askId: string,
  _prevState: AskActionState,
  formData: FormData,
): Promise<AskActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/asks");

  const body = String(formData.get("body") ?? "");

  try {
    const key = await rateLimitActorKey("ask-answer", viewer.id);
    checkRateLimit(key, 20);
    const askRow = getDb().prepare("SELECT asker_id FROM asks WHERE id = ?").get(askId) as { asker_id: string } | undefined;
    answerAsk(askId, viewer.id, body);
    if (askRow) createNotification(askRow.asker_id, "ask_answered", viewer.handle, { askId });
  } catch (e) {
    return handleAskError(e);
  }

  revalidatePath("/asks");
  return { success: "Your answer is posted." };
}

/** Server action: close *askId* — only the original asker may do this. */
export async function closeAskAction(askId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/asks/mine");

  try {
    closeAsk(askId, viewer.id);
  } catch (e) {
    if (e instanceof AskError) return;
    throw e;
  }

  revalidatePath("/asks");
  revalidatePath("/asks/mine");
}

/** Server action: opt the signed-in viewer in or out of the ask pool. */
export async function setReachableAction(reachable: boolean): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/asks");

  setReachableForAsks(viewer.id, reachable);
  revalidatePath("/asks");
  revalidatePath("/asks/mine");
}
