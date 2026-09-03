"use client";

import type { PageDocument, PagePartId } from "@/lib/pageDocumentTypes";
import { movePagePart, togglePagePart } from "@/lib/pagePartsOrdering";

const PART_LABELS: Record<PagePartId, string> = {
  identity: "Identity",
  friends: "Friends",
  links: "Links",
  now: "Now",
  gallery: "Gallery",
  blog: "Blog",
  devlog: "Devlog",
  guestbook: "Guestbook",
  topEight: "Top 8",
  badges: "Badges",
  shrine: "Shrines",
  playlist: "Playlist",
  pixelArt: "Pixel art",
  miniPages: "Mini-pages",
  stamps: "Stamps",
};

export interface LayoutTabProps {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
}

/** Studio tab for reordering and toggling the visible page sections. */
export function LayoutTab({ document: doc, onChange }: LayoutTabProps) {
  /** Moves the page part at *index* one step in *direction* (+1 down, -1 up). */
  const movePart = (index: number, direction: -1 | 1) => {
    onChange({ ...doc, pageParts: movePagePart(doc.pageParts, index, direction) });
  };

  /** Adds or removes *part* from the active page parts list. */
  const togglePart = (part: PagePartId) => {
    onChange({ ...doc, pageParts: togglePagePart(doc.pageParts, part) });
  };

  return (
    <>
      <h2 className="studio-section-title">Layout</h2>
      <p className="studio-hint">Reorder sections and adjust spacing.</p>

      <label className="field">
        <span>Density</span>
        <select
          value={doc.theme.density}
          onChange={(e) =>
            onChange({
              ...doc,
              theme: { ...doc.theme, density: e.target.value as PageDocument["theme"]["density"] },
            })
          }
        >
          <option value="cozy">Cozy</option>
          <option value="comfortable">Comfortable</option>
          <option value="spacious">Spacious</option>
        </select>
      </label>

      <fieldset className="studio-fieldset">
        <legend>Page sections</legend>
        <ul className="studio-part-list">
          {(Object.keys(PART_LABELS) as PagePartId[]).map((part) => {
            const enabled = doc.pageParts.includes(part);
            const index = doc.pageParts.indexOf(part);
            return (
              <li key={part} className="studio-part-row">
                <label className="studio-part-check">
                  <input type="checkbox" checked={enabled} onChange={() => togglePart(part)} />
                  {PART_LABELS[part]}
                </label>
                {enabled && (
                  <div className="studio-part-order">
                    <button type="button" className="studio-icon-btn" onClick={() => movePart(index, -1)} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" className="studio-icon-btn" onClick={() => movePart(index, 1)} aria-label="Move down">
                      ↓
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Render order</legend>
        <ol className="studio-order-list">
          {doc.pageParts.map((part, i) => (
            <li key={part} className="studio-order-item">
              <span>{PART_LABELS[part]}</span>
              <div className="studio-part-order">
                <button type="button" className="studio-icon-btn" onClick={() => movePart(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className="studio-icon-btn" onClick={() => movePart(i, 1)} aria-label="Move down">
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
      </fieldset>
    </>
  );
}
