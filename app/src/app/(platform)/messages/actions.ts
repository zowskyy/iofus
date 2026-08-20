"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findUserByHandle } from "@/lib/auth";
import { MessageError, markConversationRead, sendMessage } from "@/lib/messages";
import { RateLimitError } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface SendMessageState {
  error?: string;
}

export async function sendMessageAction(
  recipientHandle: string,
  _prevState: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/messages/${recipientHandle}`);

  const recipient = findUserByHandle(recipientHandle);
  if (!recipient) return { error: "That handle isn't available." };

  const body = String(formData.get("body") ?? "");

  try {
    sendMessage(viewer.id, recipient.id, body);
  } catch (e) {
    if (e instanceof MessageError || e instanceof RateLimitError) {
      return { error: e.message };
    }
    throw e;
  }

  revalidatePath(`/messages/${recipientHandle}`);
  revalidatePath("/messages");
  return {};
}

export async function markConversationReadAction(conversationId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/messages");
  try {
    markConversationRead(conversationId, viewer.id);
  } catch {
    // Not a participant, or the conversation is gone — nothing to mark.
    // This is a background "mark read" call, not a user-facing action,
    // so there's no error state to surface.
    return;
  }
  revalidatePath("/messages");
}
