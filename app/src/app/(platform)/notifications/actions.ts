"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { markAllRead } from "@/lib/notifications";

export async function markAllReadAction(): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  markAllRead(viewer.id);
}
