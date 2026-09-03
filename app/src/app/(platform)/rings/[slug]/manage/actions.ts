"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";
import {
  deleteWebRing,
  getWebRingBySlug,
  leaveWebRing,
  reviewJoinRequest,
  updateWebRing,
  WebRingError,
} from "@/lib/webRings";

export interface ManageRingState {
  error?: string;
  success?: string;
}

export async function updateRingAction(
  slug: string,
  _prevState: ManageRingState,
  formData: FormData,
): Promise<ManageRingState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const ring = getWebRingBySlug(slug);
  if (!ring) return { error: "Ring not found." };

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");

  try {
    updateWebRing(ring.id, viewer.id, { name, description });
  } catch (e) {
    if (e instanceof WebRingError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/rings/${slug}/manage`);
  return { success: "Ring updated." };
}

export async function deleteRingAction(
  slug: string,
  _prevState: ManageRingState,
  _formData: FormData,
): Promise<ManageRingState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const ring = getWebRingBySlug(slug);
  if (!ring) redirect("/rings");

  try {
    deleteWebRing(ring.id, viewer.id);
  } catch (e) {
    // Only a WebRingError (not authorized / already gone) is expected here —
    // an unexpected error must surface to the user, not silently redirect as
    // if the deletion succeeded when the ring may still exist.
    if (e instanceof WebRingError) return { error: e.message };
    throw e;
  }

  redirect("/rings");
}

export async function removeMemberAction(slug: string, memberHandle: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const ring = getWebRingBySlug(slug);
  if (!ring || ring.creatorUserId !== viewer!.id) return;

  const user = findUserByHandle(memberHandle);
  if (user) leaveWebRing(ring.id, user.id);
  revalidatePath(`/rings/${slug}/manage`);
}

export async function reviewRequestAction(
  slug: string,
  requestUserId: string,
  accept: boolean,
): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const ring = getWebRingBySlug(slug);
  if (!ring) return;

  try {
    reviewJoinRequest(ring.id, requestUserId, viewer!.id, accept);
  } catch (e) {
    if (e instanceof WebRingError) return;
    throw e;
  }

  if (accept) {
    createNotification(requestUserId, "ring_join_accepted", viewer!.handle, { ringName: ring.name, ringSlug: ring.slug });
  }

  revalidatePath(`/rings/${slug}/manage`);
}
