import { countIncomingRequests } from "./friends";
import { countPendingGuestbookEntries } from "./guestbook";
import { countUnreadMessages } from "./messages";
import { countUnread } from "./notifications";

export interface NavCounts {
  pendingCount: number;
  unreadMessages: number;
  unreadNotifications: number;
}

/** Fetch all navigation badge counts for *userId* in a single batched call. */
export function getNavCounts(userId: string): NavCounts {
  const pendingCount = countIncomingRequests(userId) + countPendingGuestbookEntries(userId);
  const unreadMessages = countUnreadMessages(userId);
  const unreadNotifications = countUnread(userId);
  return { pendingCount, unreadMessages, unreadNotifications };
}
