"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";
import {
  getWebRingBySlug,
  joinWebRing,
  leaveWebRing,
  WebRingError,
} from "@/lib/webRings";

export async function joinRingAction(slug: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/explore/ring/${slug}`);

  const ring = getWebRingBySlug(slug);
  if (!ring) redirect("/rings");

  try {
    const result = joinWebRing(ring.id, viewer!.id);
    if (result === "requested" && ring.creatorUserId) {
      createNotification(ring.creatorUserId, "ring_join_request", viewer!.handle, {
        ringName: ring.name,
        ringSlug: ring.slug,
      });
    }
  } catch (e) {
    if (e instanceof WebRingError) redirect(`/explore/ring/${slug}`);
    throw e;
  }

  revalidatePath(`/explore/ring/${slug}`);
  revalidatePath("/rings");
  redirect(`/explore/ring/${slug}`);
}

export async function leaveRingAction(slug: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/explore/ring/${slug}`);

  const ring = getWebRingBySlug(slug);
  if (!ring) redirect("/rings");

  leaveWebRing(ring!.id, viewer!.id);
  revalidatePath(`/explore/ring/${slug}`);
  revalidatePath("/rings");
  redirect(`/explore/ring/${slug}`);
}
