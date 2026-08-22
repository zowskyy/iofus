"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface Props {
  handles: string[];
}

export function WanderClient({ handles }: Props) {
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
        window.location.href = "/explore";
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  // Clear loading state once iframe finishes loading
  const onIframeLoad = useCallback(() => {
    setLoading(false);
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
    <div className="wander-shell">
      <div className="wander-chrome">
        <Link href={`/@${handle}`} className="wander-handle" target="_blank" rel="noreferrer">
          @{handle}
        </Link>
        <div className="wander-controls">
          <span className="wander-progress">
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
