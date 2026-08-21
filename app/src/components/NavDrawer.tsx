"use client";
import { useState } from "react";

interface Props {
  children: React.ReactNode;
  pendingCount: number;
  unreadMessages: number;
}

export function NavDrawer({ children, pendingCount, unreadMessages }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="nav-drawer-wrap">
      <button
        className="nav-hamburger"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "✕" : "☰"}
        {!open && (pendingCount > 0 || unreadMessages > 0) && (
          <span className="nav-badge nav-hamburger-badge" aria-hidden="true">
            {pendingCount + unreadMessages}
          </span>
        )}
      </button>
      {open && (
        <nav className="nav-drawer-panel" onClick={() => setOpen(false)}>
          {children}
        </nav>
      )}
    </div>
  );
}
