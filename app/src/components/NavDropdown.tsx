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
            // close it, same as any normal nav click would.
            if ((e.target as HTMLElement).closest("a, button")) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
