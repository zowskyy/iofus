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
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface AskActionState {
  error?: string;
  success?: string;
}

function handleAskError(e: unknown): never | AskActionState {
  if (e instanceof AskError) return { error: e.message };
  if (e instanceof RateLimitError) return { error: e.message };
  throw e;
}

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
    const key = await rateLimitActorKey("ask-view", viewer.id);
    checkRateLimit(key, 20);
    createAsk({ askerId: viewer.id, body, domain, isAnonymous, isSensitive });
  } catch (e) {
    return handleAskError(e);
  }

  revalidatePath("/asks");
  revalidatePath("/asks/mine");
  return { success: "Your ask is posted." };
}

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
    answerAsk(askId, viewer.id, body);
  } catch (e) {
    return handleAskError(e);
  }

  revalidatePath("/asks");
  return { success: "Your answer is posted." };
}

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

export async function setReachableAction(reachable: boolean): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/asks");

  setReachableForAsks(viewer.id, reachable);
  revalidatePath("/asks");
}
