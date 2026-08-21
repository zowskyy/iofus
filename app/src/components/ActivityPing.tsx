"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface PingData {
  unreadMessages: number;
  pendingGuestbook: number;
}

interface Props {
  /** The signed-in user's handle, null when logged out. */
  handle: string | null;
  /** Initial counts passed from the server to avoid a first-render flash. */
  initial: PingData;
}

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Polls /api/activity every 30s and shows a toast if new activity arrives.
 * Progressive enhancement: does nothing when JS is off or user is logged out.
 */
export function ActivityPing({ handle, initial }: Props) {
  const [prev, setPrev] = useState<PingData>(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [toastHref, setToastHref] = useState<string>("/");

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/activity", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as PingData;

      const newMessages = data.unreadMessages - prev.unreadMessages;
      const newGuestbook = data.pendingGuestbook - prev.pendingGuestbook;

      if (newMessages > 0) {
        setToast(`${newMessages} new message${newMessages > 1 ? "s" : ""}`);
        setToastHref("/messages");
      } else if (newGuestbook > 0) {
        setToast(`${newGuestbook} new guestbook ${newGuestbook > 1 ? "entries" : "entry"}`);
        setToastHref(`/@${handle}/guestbook`);
      }

      setPrev(data);
    } catch {
      // network error — silent
    }
  }, [prev, handle]);

  useEffect(() => {
    if (!handle) return;
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [poll, handle]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="ping-indicator" role="status" aria-live="polite">
      <span>●</span>
      <Link href={toastHref} onClick={() => setToast(null)}>
        {toast}
      </Link>
      <button
        onClick={() => setToast(null)}
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, marginLeft: "0.25rem" }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
