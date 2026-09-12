"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  handles: string[];
}

// Minimum horizontal drag distance, and how much more horizontal than
// vertical movement there must be, before a touch is treated as a
// next/prev swipe rather than the visitor scrolling the framed page.
const SWIPE_MIN_DISTANCE_PX = 60;
const SWIPE_DIRECTION_RATIO = 1.5;

/** Client-side Wander UI: full-screen iframe navigation between profile pages with next/previous buttons, keyboard nav, touch swipe, and cross-fade loading animation. */
export function WanderClient({ handles }: Props) {
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const detachFrameTouchRef = useRef<(() => void) | null>(null);
  const router = useRouter();

  const handle = handles[index] ?? null;

  const goNext = useCallback(() => {
    setIndex((i) => {
      const next = Math.min(i + 1, handles.length - 1);
      if (next !== i) setLoading(true);
      return next;
    });
  }, [handles.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => {
      const prev = Math.max(i - 1, 0);
      if (prev !== i) setLoading(true);
      return prev;
    });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "j" || e.key === "J") goNext();
      if (e.key === "ArrowLeft" || e.key === "k" || e.key === "K") goPrev();
      if (e.key === "Escape") {
        router.push("/explore");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, router]);

  // Touch swipe is an enhancement layered on top of the buttons and keyboard
  // nav above, never a replacement — WCAG 2.5.1 requires a single-pointer
  // alternative to any path-based gesture, and both already exist here.
  const handleTouchStart = useCallback((x: number, y: number) => {
    touchStartRef.current = { x, y };
  }, []);

  const handleTouchEnd = useCallback(
    (x: number, y: number) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;

      const dx = x - start.x;
      const dy = y - start.y;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return;

      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) handleTouchStart(t.clientX, t.clientY);
    },
    [handleTouchStart],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const t = e.changedTouches[0];
      if (t) handleTouchEnd(t.clientX, t.clientY);
    },
    [handleTouchEnd],
  );

  // The listeners above only ever see touches that land on the chrome —
  // the framed profile page renders in its own browsing context, so touches
  // over it (nearly the whole screen) never bubble out to .wander-shell.
  // Same-origin (sandbox includes allow-same-origin, and src is always
  // `/@handle` on this origin), so its document is reachable directly;
  // attach the same swipe handlers there too, and detach on the next load
  // in case an in-frame link causes another same-origin navigation.
  const onIframeLoad = useCallback(() => {
    setLoading(false);
    detachFrameTouchRef.current?.();
    detachFrameTouchRef.current = null;

    try {
      const frameDoc = iframeRef.current?.contentDocument;
      if (!frameDoc) return;

      const onFrameTouchStart = (e: TouchEvent) => {
        const t = e.touches[0];
        if (t) handleTouchStart(t.clientX, t.clientY);
      };
      const onFrameTouchEnd = (e: TouchEvent) => {
        const t = e.changedTouches[0];
        if (t) handleTouchEnd(t.clientX, t.clientY);
      };

      frameDoc.addEventListener("touchstart", onFrameTouchStart, { passive: true });
      frameDoc.addEventListener("touchend", onFrameTouchEnd, { passive: true });
      detachFrameTouchRef.current = () => {
        frameDoc.removeEventListener("touchstart", onFrameTouchStart);
        frameDoc.removeEventListener("touchend", onFrameTouchEnd);
      };
    } catch {
      // Same-origin access unexpectedly denied (e.g. a transient about:blank
      // during navigation) — swipe over the chrome still works either way.
    }
  }, [handleTouchStart, handleTouchEnd]);

  useEffect(() => {
    return () => detachFrameTouchRef.current?.();
  }, []);

  if (!handle) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <p>No public pages to wander through yet.</p>
        <Link href="/explore" className="btn secondary" style={{ marginTop: "1rem" }}>
          Back to Explore
        </Link>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: "0.78rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Wander Mode
        </p>
        <h1 style={{ marginBottom: "1rem" }}>Drift through walls</h1>
        <p style={{ color: "var(--ink-soft)", maxWidth: "420px", margin: "0 auto 2rem" }}>
          Full-screen profiles, one after another. No algorithm, just pages people actually made.
          Use arrow keys or the buttons to move.
        </p>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.8rem", marginBottom: "2rem" }}>
          <span className="kbd-hint"><kbd>→</kbd> / <kbd>J</kbd> next</span>
          {" · "}
          <span className="kbd-hint"><kbd>←</kbd> / <kbd>K</kbd> prev</span>
          {" · "}
          <span className="kbd-hint"><kbd>Esc</kbd> exit</span>
        </p>
        <button className="btn" onClick={() => setStarted(true)}>
          Start wandering
        </button>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/explore" className="wander-exit">← Back to Explore</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="wander-shell" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Visually hidden but announced by screen readers on each change — the
          visual progress counter below is aria-hidden so the position isn't
          announced twice. */}
      <p className="sr-only" role="status" aria-live="polite">
        {loading ? `Loading @${handle}…` : `Showing @${handle}, page ${index + 1} of ${handles.length}`}
      </p>
      <div className="wander-chrome">
        <Link href={`/@${handle}`} className="wander-handle" target="_blank" rel="noreferrer">
          @{handle}
        </Link>
        <div className="wander-controls">
          <span className="wander-progress" aria-hidden="true">
            {index + 1} / {handles.length}
          </span>
          <button
            className="wander-btn"
            onClick={goPrev}
            disabled={index === 0}
            aria-label="Previous page"
            title="← K"
          >
            ←
          </button>
          <button
            className="wander-btn primary"
            onClick={goNext}
            disabled={index >= handles.length - 1}
            aria-label="Next page"
            title="→ J"
          >
            Next →
          </button>
          <Link href="/explore" className="wander-exit">
            Exit
          </Link>
        </div>
      </div>
      {/* Loading overlay: dims + blurs the frame with an animated ring while next page loads */}
      {loading && (
        <div className="wander-loading" aria-hidden="true">
          <div className="wander-loading-ring" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        key={handle}
        className={`wander-frame${loading ? " wander-frame--loading" : ""}`}
        src={`/@${handle}`}
        title={`@${handle}'s page`}
        sandbox="allow-scripts allow-same-origin allow-forms"
        onLoad={onIframeLoad}
      />
    </div>
  );
}
