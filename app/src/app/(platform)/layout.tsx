import "../platform.css";
import { SiteNav } from "@/components/SiteNav";
import { ActivityPing } from "@/components/ActivityPing";
import { getCurrentUser } from "@/lib/session";
import { countUnreadMessages } from "@/lib/messages";
import { countIncomingRequests } from "@/lib/friends";
import { countPendingGuestbookEntries } from "@/lib/guestbook";
import { countUnread } from "@/lib/notifications";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getCurrentUser();
  const initial = viewer
    ? {
        unreadMessages: countUnreadMessages(viewer.id),
        pendingGuestbook: countIncomingRequests(viewer.id) + countPendingGuestbookEntries(viewer.id),
        unreadNotifications: countUnread(viewer.id),
      }
    : { unreadMessages: 0, pendingGuestbook: 0, unreadNotifications: 0 };

  return (
    <>
      <SiteNav />
      {children}
      <ActivityPing handle={viewer?.handle ?? null} initial={initial} />
    </>
  );
}
