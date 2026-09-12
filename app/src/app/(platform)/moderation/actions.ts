"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  findUserForModeration,
  isModerator,
  logModeratorAction,
  ReportNotOpenError,
  reviewReport,
  setPlatformBlock,
} from "@/lib/moderation";
import { reviewAppeal } from "@/lib/appeals";
import { reviewThemeReport } from "@/lib/sharedThemes";
import { getCurrentUser } from "@/lib/session";

async function requireModerator() {
  const viewer = await getCurrentUser();
  if (!viewer || !isModerator(viewer.id)) redirect("/");
  return viewer;
}

export async function reviewReportAction(reportId: string, formData: FormData): Promise<void> {
  const moderator = await requireModerator();
  const note = String(formData.get("note") ?? "");
  try {
    reviewReport(reportId, moderator.id, "reviewed", note);
  } catch (e) {
    // Already resolved by another moderator or an earlier click — nothing
    // more to do, and re-throwing would 500 what's really a stale-UI race.
    if (!(e instanceof ReportNotOpenError)) throw e;
  }
  revalidatePath("/moderation");
}

export async function dismissReportAction(reportId: string, formData: FormData): Promise<void> {
  const moderator = await requireModerator();
  const note = String(formData.get("note") ?? "");
  try {
    reviewReport(reportId, moderator.id, "dismissed", note);
  } catch (e) {
    if (!(e instanceof ReportNotOpenError)) throw e;
  }
  revalidatePath("/moderation");
}

export async function platformBlockAction(handle: string): Promise<void> {
  const moderator = await requireModerator();
  const target = findUserForModeration(handle);
  if (target) setPlatformBlock(target.id, true, moderator.id);
  revalidatePath("/moderation");
}

export async function platformUnblockAction(handle: string): Promise<void> {
  const moderator = await requireModerator();
  const target = findUserForModeration(handle);
  if (target) setPlatformBlock(target.id, false, moderator.id);
  revalidatePath("/moderation");
}

export async function reviewThemeReportAction(reportId: string, formData: FormData): Promise<void> {
  const moderator = await requireModerator();
  const note = String(formData.get("note") ?? "");
  reviewThemeReport(reportId, moderator.id, "reviewed", note);
  logModeratorAction(moderator.id, "theme_report_reviewed", null, note);
  revalidatePath("/moderation");
}

export async function dismissThemeReportAction(reportId: string, formData: FormData): Promise<void> {
  const moderator = await requireModerator();
  const note = String(formData.get("note") ?? "");
  reviewThemeReport(reportId, moderator.id, "dismissed", note);
  logModeratorAction(moderator.id, "theme_report_dismissed", null, note);
  revalidatePath("/moderation");
}

export async function grantAppealAction(appealId: string, formData: FormData): Promise<void> {
  const moderator = await requireModerator();
  const note = String(formData.get("note") ?? "");
  reviewAppeal(appealId, moderator.id, "granted", note);
  logModeratorAction(moderator.id, "appeal_granted", null, note);
  revalidatePath("/moderation");
}

export async function dismissAppealAction(appealId: string, formData: FormData): Promise<void> {
  const moderator = await requireModerator();
  const note = String(formData.get("note") ?? "");
  reviewAppeal(appealId, moderator.id, "dismissed", note);
  logModeratorAction(moderator.id, "appeal_dismissed", null, note);
  revalidatePath("/moderation");
}
