"use server";

import { redirect } from "next/navigation";
import { createWebRing, WebRingError } from "@/lib/webRings";
import { getCurrentUser } from "@/lib/session";

export interface CreateRingState {
  error?: string;
}

export async function createRingAction(
  _prevState: CreateRingState,
  formData: FormData,
): Promise<CreateRingState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/rings/new");

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const isOpen = formData.get("is_open") !== "closed";

  let ring;
  try {
    ring = createWebRing(viewer.id, { name, description, isOpen });
  } catch (e) {
    if (e instanceof WebRingError) return { error: e.message };
    throw e;
  }

  redirect(`/rings/${ring.slug}/manage`);
  return {};
}
