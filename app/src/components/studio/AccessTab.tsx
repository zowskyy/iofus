"use client";

import { useMemo } from "react";
import { profileScopeClass, scopeProfileCss } from "@/lib/cssScope";
import type { PageDocument } from "@/lib/pageDocumentTypes";

export interface AccessTabProps {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
  warnings: string[];
  handle: string;
}

/** Studio tab for custom CSS, contrast warnings, and scoped CSS preview. */
export function AccessTab({ document: doc, onChange, warnings, handle }: AccessTabProps) {
  /** Scoped CSS string derived from the custom CSS field, namespaced to the profile's scope class. */
  const cssScope = useMemo(
    () => scopeProfileCss(doc.theme.customCss, profileScopeClass(handle)),
    [doc.theme.customCss, handle],
  );

  return (
    <>
      <h2 className="studio-section-title">Access</h2>
      <p className="studio-hint">Accessibility reminders and motion preferences.</p>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={doc.access.altTextReminder}
          onChange={(e) =>
            onChange({ ...doc, access: { ...doc.access, altTextReminder: e.target.checked } })
          }
        />
        <span>Alt text reminders for gallery images</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={doc.access.contrastWarningsEnabled}
          onChange={(e) =>
            onChange({ ...doc, access: { ...doc.access, contrastWarningsEnabled: e.target.checked } })
          }
        />
        <span>Contrast warnings</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={doc.theme.reduceMotion}
          onChange={(e) =>
            onChange({ ...doc, theme: { ...doc.theme, reduceMotion: e.target.checked } })
          }
        />
        <span>Reduce motion on your page</span>
      </label>

      {doc.access.altTextReminder && doc.gallery.some((g) => !g.alt.trim()) && (
        <p className="studio-warning">Some gallery images are missing alt text.</p>
      )}

      {warnings.length > 0 && (
        <ul className="studio-warning-list">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <fieldset className="studio-fieldset">
        <legend>Advanced CSS</legend>
        <p className="studio-warning">
          Custom CSS is scoped to your page only. Avoid layout-breaking rules, fixed overlays, or
          selectors targeting the whole site. Blocked rules will not apply when published.
        </p>
        <label className="studio-toggle">
          <input
            type="checkbox"
            checked={doc.theme.customCssEnabled}
            onChange={(e) =>
              onChange({ ...doc, theme: { ...doc.theme, customCssEnabled: e.target.checked } })
            }
          />
          <span>Enable custom CSS on your live page</span>
        </label>
        <label className="field">
          <span>Custom CSS</span>
          <textarea
            rows={8}
            maxLength={8000}
            value={doc.theme.customCss}
            disabled={!doc.theme.customCssEnabled}
            placeholder={`.bio { letter-spacing: 0.02em; }\n.panel { border-radius: 12px; }`}
            onChange={(e) =>
              onChange({ ...doc, theme: { ...doc.theme, customCss: e.target.value } })
            }
          />
        </label>
        {cssScope.warnings.length > 0 && (
          <ul className="studio-warning-list">
            {cssScope.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {cssScope.rejected.length > 0 && (
          <ul className="studio-warning-list">
            {cssScope.rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {doc.theme.customCssEnabled && cssScope.css && cssScope.rejected.length === 0 && (
          <p className="studio-hint mono">Scoped preview: {cssScope.css.split("\n").length} rule(s) OK</p>
        )}
      </fieldset>
    </>
  );
}
