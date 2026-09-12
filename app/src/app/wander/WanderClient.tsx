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

  // Clear loading state once iframe finishes loading
  const onIframeLoad = useCallback(() => {
    setLoading(false);
  }, []);

  // Touch swipe is an enhancement layered on top of the buttons and keyboard
  // nav above, never a replacement — WCAG 2.5.1 requires a single-pointer
  // alternative to any path-based gesture, and both already exist here.
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      const end = e.changedTouches[0];
      if (!start || !end) return;

      const dx = end.clientX - start.x;
      const dy = end.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return;

      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

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
