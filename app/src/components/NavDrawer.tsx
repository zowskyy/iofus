"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  pendingCount: number;
  unreadMessages: number;
  unreadNotifications: number;
}

/** A touch-first nav drawer: closes on outside tap, Escape, or activating an item inside it, and returns focus to the hamburger — mirrors NavDropdown's interaction pattern instead of only closing on an inside click. */
export function NavDrawer({ children, pendingCount, unreadMessages, unreadNotifications }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        triggerRef.current?.focus();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="nav-drawer-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        className="nav-hamburger"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "✕" : "☰"}
        {!open && (pendingCount > 0 || unreadMessages > 0 || unreadNotifications > 0) && (
          <span className="nav-badge nav-hamburger-badge" aria-hidden="true">
            {pendingCount + unreadMessages + unreadNotifications}
          </span>
        )}
      </button>
      {open && (
        <nav
          className="nav-drawer-panel"
          aria-label="Site menu"
          onClick={(e) => {
            // Deferred close so a real <form method="post"> submit (Log out)
            // fires its native default action before this panel unmounts —
            // same reasoning as NavDropdown's click handler.
            if ((e.target as HTMLElement).closest("a, button")) {
              setTimeout(() => setOpen(false), 0);
            }
          }}
        >
          {children}
        </nav>
      )}
    </div>
  );
}
