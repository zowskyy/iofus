"use client";

import type { PageDocument, StoredPage } from "@/lib/pageDocumentTypes";

export interface PublishTabProps {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
  isPublished: boolean;
  visibility: StoredPage["visibility"];
  hiddenFromDiscovery: boolean;
  guestbookDisabled: boolean;
  hasDraft: boolean;
  safePreview: boolean;
  versions: { id: string; createdAt: string }[];
  pending: boolean;
  onSafePreviewChange: (v: boolean) => void;
  onPublishToggle: (published: boolean) => void;
  onVisibilityChange: (v: StoredPage["visibility"]) => void;
  onHiddenChange: (hidden: boolean) => void;
  onGuestbookDisabledChange: (disabled: boolean) => void;
  onPublishDraft: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onRestoreVersion: (id: string) => void;
  onClearStamps: () => void;
}

/** Studio tab for publish state, visibility, discovery, guestbook, and page management actions. */
export function PublishTab({
  document: doc,
  onChange,
  isPublished,
  visibility,
  hiddenFromDiscovery,
  guestbookDisabled,
  hasDraft,
  safePreview,
  versions,
  pending,
  onSafePreviewChange,
  onPublishToggle,
  onVisibilityChange,
  onHiddenChange,
  onGuestbookDisabledChange,
  onPublishDraft,
  onExport,
  onImport,
  onRestoreVersion,
  onClearStamps,
}: PublishTabProps) {
  return (
    <>
      <h2 className="studio-section-title">Publish</h2>
      <p className="studio-hint">Visibility, drafts, versions, and backup.</p>

      <div className="studio-publish-row">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => onPublishToggle(!isPublished)}
        >
          {isPublished ? "Unpublish" : "Publish page"}
        </button>
        {hasDraft && (
          <button type="button" className="btn secondary" disabled={pending} onClick={onPublishDraft}>
            Publish saved draft
          </button>
        )}
      </div>

      <label className="field">
        <span>Visibility</span>
        <select
          value={visibility}
          disabled={pending}
          onChange={(e) => onVisibilityChange(e.target.value as StoredPage["visibility"])}
        >
          <option value="private">Private — only you</option>
          <option value="unlisted">Unlisted — link only</option>
          <option value="public">Public — discoverable</option>
        </select>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={hiddenFromDiscovery}
          disabled={pending}
          onChange={(e) => onHiddenChange(e.target.checked)}
        />
        <span>Hide from discovery (still reachable by link when public)</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={guestbookDisabled}
          disabled={pending}
          onChange={(e) => onGuestbookDisabledChange(e.target.checked)}
        />
        <span>Disable guestbook</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={doc.guestbook.enabled}
          onChange={(e) =>
            onChange({ ...doc, guestbook: { ...doc.guestbook, enabled: e.target.checked } })
          }
        />
        <span>Guestbook enabled in page document</span>
      </label>

      <fieldset className="studio-fieldset">
        <legend>Stamps</legend>
        <label className="studio-toggle">
          <input
            type="checkbox"
            checked={doc.stamps.stampsEnabled}
            onChange={(e) =>
              onChange({ ...doc, stamps: { ...doc.stamps, stampsEnabled: e.target.checked } })
            }
          />
          <span>Stamp wall enabled</span>
        </label>
        <button
          type="button"
          className="btn secondary"
          disabled={pending}
          onClick={onClearStamps}
        >
          Clear all stamps
        </button>
      </fieldset>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={safePreview}
          onChange={(e) => onSafePreviewChange(e.target.checked)}
        />
        <span>Safe preview — show current edits in preview panel (not what&apos;s live)</span>
      </label>

      <fieldset className="studio-fieldset">
        <legend>Version history</legend>
        {versions.length === 0 ? (
          <p className="studio-hint">No previous versions yet — they appear after you publish changes.</p>
        ) : (
          <ul className="studio-version-list">
            {versions.map((v) => (
              <li key={v.id}>
                <span className="mono">{new Date(v.createdAt).toLocaleString()}</span>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={pending}
                  onClick={() => onRestoreVersion(v.id)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Export & import</legend>
        <div className="studio-publish-row">
          <button type="button" className="btn secondary" disabled={pending} onClick={onExport}>
            Download JSON
          </button>
          <label className="btn secondary studio-file-label">
            Upload JSON
            <input
              type="file"
              accept="application/json,.json"
              className="studio-file-input"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="studio-publish-row" style={{ marginTop: "0.5rem" }}>
          <a href="/api/export" className="btn secondary" download="my-page.html">
            Download as HTML
          </a>
        </div>
        <p className="studio-hint" style={{ marginTop: "0.25rem" }}>
          Self-contained static page you can host anywhere.
        </p>
      </fieldset>
    </>
  );
}
