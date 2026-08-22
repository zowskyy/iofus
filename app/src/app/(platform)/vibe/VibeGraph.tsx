"use client";

import Link from "next/link";

interface Node {
  id: string;
  handle: string;
  displayName: string;
}

interface Props {
  center: Node;
  neighbors: Node[];
  statuses: Record<string, string>;
}

/** CSS-only Vibe Graph: center node + radial neighbor nodes. No canvas, no SVG — pure flex layout with orbital positioning via CSS custom properties. */
export function VibeGraph({ center, neighbors, statuses }: Props) {
  const total = neighbors.length;

  return (
    <div className="vibe-graph" aria-label="Vibe graph: your connections">
      {/* Center node (you) */}
      <div className="vibe-center">
        <Link href={`/@${center.handle}`} className="vibe-node vibe-node--center">
          <span className="vibe-node-name">{center.displayName}</span>
          <span className="vibe-node-handle mono">@{center.handle}</span>
          {statuses[center.id] && (
            <span className="vibe-node-status mono">{statuses[center.id]}</span>
          )}
        </Link>
      </div>

      {/* Neighbor nodes in a radial list — each gets an angle for optional CSS positioning */}
      {neighbors.length > 0 && (
        <ul className="vibe-neighbors" aria-label="Your connections">
          {neighbors.map((n, i) => {
            const angle = total === 1 ? 90 : (360 / total) * i - 90;
            const radRatio = i < 6 ? 0 : 1; // inner ring (0-5) vs outer ring (6+)
            return (
              <li
                key={n.id}
                className={`vibe-neighbor-item${radRatio === 1 ? " vibe-neighbor-item--outer" : ""}`}
                style={{ "--angle": `${angle}deg` } as React.CSSProperties}
              >
                <Link href={`/@${n.handle}`} className="vibe-node">
                  <span className="vibe-node-name">{n.displayName}</span>
                  <span className="vibe-node-handle mono">@{n.handle}</span>
                  {statuses[n.id] && (
                    <span className="vibe-node-status mono">{statuses[n.id]}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
