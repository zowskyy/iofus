"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findUserByHandle } from "@/lib/auth";
import {
  acceptFriendRequest,
  FriendLinkNotFoundError,
  FriendRequestError,
  removeFriendLink,
  unblockUser,
} from "@/lib/friends";
import { GuestbookError, moderateGuestbookEntry } from "@/lib/guestbook";
import { activatePanicMode, deactivatePanicMode, getPageDocument } from "@/lib/pageDocument";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface SettingsActionState {
  error?: string;
}

/**
 * Every action below is bound with its row-specific argument(s) before being
 * handed to `useActionState` (`unblockAction.bind(null, handle)`, matching
 * ManageRingControls' established convention) so the component gets a
 * pending flag (disables the button — the mobile-network duplicate-submit
 * guard) and an `{ error }` state to render inline, via
 * `withNetworkErrorHandling` from `@/lib/actionResilience`, instead of a
 * silently-swallowed network failure.
 */

export async function unblockUserAction(blockedUserId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");
  unblockUser(viewer.id, blockedUserId);
  revalidatePath("/settings");
}

export async function unblockAction(
  handle: string,
  _prevState: SettingsActionState,
  _formData: FormData,
): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  const target = findUserByHandle(handle);
  if (!target) return {};

  unblockUser(viewer.id, target.id);
  revalidatePath("/settings");
  return {};
}

export async function acceptIncomingAction(
  requestId: string,
  _prevState: SettingsActionState,
  _formData: FormData,
): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  try {
    const key = await rateLimitActorKey("friend", viewer.id);
    checkRateLimit(key, 10);
    acceptFriendRequest(viewer.id, requestId);
    revalidatePath("/settings");
    return {};
  } catch (e) {
    if (e instanceof FriendRequestError || e instanceof FriendLinkNotFoundError) {
      return { error: "That request is no longer available." };
    }
    if (e instanceof RateLimitError) return { error: "Too many requests — try again in a moment." };
    throw e;
  }
}

export async function declineIncomingAction(
  requestId: string,
  _prevState: SettingsActionState,
  _formData: FormData,
): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  try {
    const key = await rateLimitActorKey("friend", viewer.id);
    checkRateLimit(key, 10);
    removeFriendLink(viewer.id, requestId);
    revalidatePath("/settings");
    return {};
  } catch (e) {
    if (e instanceof FriendRequestError) return { error: "That request is no longer available." };
    if (e instanceof RateLimitError) return { error: "Too many requests — try again in a moment." };
    throw e;
  }
}

export async function approveGuestbookAction(
  entryId: string,
  _prevState: SettingsActionState,
  _formData: FormData,
): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  try {
    moderateGuestbookEntry(viewer.id, entryId, true);
    revalidatePath("/settings");
    revalidatePath(`/@${viewer.handle}`);
    return {};
  } catch (e) {
    if (e instanceof GuestbookError) return { error: "That entry was already moderated." };
    throw e;
  }
}

export async function rejectGuestbookAction(
  entryId: string,
  _prevState: SettingsActionState,
  _formData: FormData,
): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  try {
    moderateGuestbookEntry(viewer.id, entryId, false);
    revalidatePath("/settings");
    return {};
  } catch (e) {
    if (e instanceof GuestbookError) return { error: "That entry was already moderated." };
    throw e;
  }
}

/**
 * Sets panic mode to an explicit *activate* state, bound at render time from
 * the page's current state (see settings/page.tsx). Deliberately takes the
 * desired state rather than reading current state and flipping it: a form
 * resubmit after a dropped response (common on flaky mobile connections)
 * would otherwise silently toggle panic mode back off, undoing the user's
 * action instead of just repeating it.
 */
export async function panicModeAction(
  activate: boolean,
  _prevState: SettingsActionState,
  _formData: FormData,
): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  const stored = getPageDocument(viewer.id);
  if (!stored) redirect("/make");

  if (activate) {
    activatePanicMode(viewer.id);
  } else {
    deactivatePanicMode(viewer.id);
  }
  revalidatePath("/settings");
  revalidatePath(`/@${viewer.handle}`);
  return {};
}

export interface EmailState {
  error?: string;
  success?: string;
}

export async function updateEmailAction(_prev: EmailState, formData: FormData): Promise<EmailState> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "You must be logged in." };
  const { setUserEmail, PasswordResetError } = await import("@/lib/passwordReset");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email address." };
  try {
    setUserEmail(viewer.id, email);
    return { success: "Recovery email saved." };
  } catch (err) {
    if (err instanceof PasswordResetError) return { error: err.message };
    console.error("[updateEmailAction] unexpected error", err);
    return { error: "Something went wrong. Try again." };
  }
}
