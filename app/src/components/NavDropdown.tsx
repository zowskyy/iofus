"use client";
import { useEffect, useId, useRef, useState } from "react";

interface Props {
  label: string;
  children: React.ReactNode;
  /** Shown as a badge next to the label, e.g. an aggregate pending-items count. */
  badgeCount?: number;
}

/** A click-to-open nav menu, closing on outside click, Escape, or activating an item inside it. */
export function NavDropdown({ label, children, badgeCount = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="nav-dropdown" ref={wrapRef}>
      <button
        type="button"
        className="nav-dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {badgeCount > 0 && (
          <span className="nav-badge" aria-label={`${badgeCount} pending`}>
            {badgeCount}
          </span>
        )}
        <span className="nav-dropdown-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="nav-dropdown-panel"
          onClick={(e) => {
            // Activating a link or the logout button inside the menu should
            // close it, same as any normal nav click would — but Log out is
            // a real <form method="post"> submit button, and closing
            // synchronously here would unmount that form (this panel) in
            // the same click that's supposed to submit it, which cancels
            // the browser's native form-submission default action before
            // it fires. Deferring the close to a macrotask lets that
            // default action run first; for a next/link click (which
            // preventDefault()s and navigates client-side) the delay is
            // imperceptible either way.
            if ((e.target as HTMLElement).closest("a, button")) {
              setTimeout(() => setOpen(false), 0);
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
