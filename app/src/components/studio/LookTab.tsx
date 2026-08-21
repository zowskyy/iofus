"use client";

import { useState } from "react";
import Link from "next/link";
import { applyCreativeSpark, applyTemplateMood, TEMPLATE_MOODS } from "@/lib/creativeSparks";
import type { PageDocument, TemplateId } from "@/lib/pageDocumentTypes";

export interface LookTabProps {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
  handle: string;
  pending: boolean;
  onPublishTheme: (name: string, description: string, tags: string) => void;
}

/** Studio tab for colors, fonts, background, and theme publishing. */
export function LookTab({ document: doc, onChange, handle, pending, onPublishTheme }: LookTabProps) {
  const [themeName, setThemeName] = useState("");
  const [themeDescription, setThemeDescription] = useState("");
  const [themeTags, setThemeTags] = useState("");

  /** Applies *template* mood preset to the document. */
  const setTemplate = (template: TemplateId) => {
    onChange(applyTemplateMood(doc, template));
  };

  /** Applies a random color surprise spark to the document. */
  const surpriseColors = () => {
    onChange(applyCreativeSpark("surprise-colors", doc));
  };

  return (
    <>
      <h2 className="studio-section-title">Look</h2>
      <p className="studio-hint">
        Pick a mood, nudge the colors, make it yours. Community themes live in the{" "}
        <Link href="/explore/themes">theme gallery</Link>.
      </p>

      <fieldset className="studio-fieldset">
        <legend>Template</legend>
        <div className="studio-template-grid template-mood-grid">
          {TEMPLATE_MOODS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={doc.theme.template === t.id ? "studio-template-card template-mood-card active" : "studio-template-card template-mood-card"}
              onClick={() => setTemplate(t.id)}
            >
              <span className="template-mood-swatches" aria-hidden="true">
                <span style={{ background: t.background }} />
                <span style={{ background: t.accent }} />
              </span>
              <span className="template-mood-name">{t.label}</span>
              <span className="template-mood-tagline">{t.tagline}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="studio-color-row">
        <button type="button" className="btn secondary wonder-surprise-btn" onClick={surpriseColors}>
          Surprise me
        </button>
        <label className="field">
          <span>Accent</span>
          <input
            type="color"
            value={doc.theme.accent}
            onChange={(e) =>
              onChange({ ...doc, theme: { ...doc.theme, accent: e.target.value } })
            }
          />
          <span className="mono studio-hex">{doc.theme.accent}</span>
        </label>
        <label className="field">
          <span>Background</span>
          <input
            type="color"
            value={doc.theme.background}
            onChange={(e) =>
              onChange({ ...doc, theme: { ...doc.theme, background: e.target.value } })
            }
          />
          <span className="mono studio-hex">{doc.theme.background}</span>
        </label>
      </div>

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

      <label className="field">
        <span>Font style</span>
        <select
          value={doc.theme.fontStyle}
          onChange={(e) =>
            onChange({
              ...doc,
              theme: { ...doc.theme, fontStyle: e.target.value as PageDocument["theme"]["fontStyle"] },
            })
          }
        >
          <option value="sans">Sans</option>
          <option value="serif">Serif</option>
          <option value="mono">Mono</option>
        </select>
      </label>

      <fieldset className="studio-fieldset">
        <legend>Y2K flourishes</legend>
        <p className="studio-hint">
          Tiled backgrounds and a scrolling status line — straight out of 2003. Turning on "Reduce motion"
          (Access tab) always wins over the marquee.
        </p>
        <label className="field">
          <span>Background image URL</span>
          <input
            type="url"
            value={doc.theme.backgroundImageUrl ?? ""}
            onChange={(e) =>
              onChange({
                ...doc,
                theme: { ...doc.theme, backgroundImageUrl: e.target.value || undefined },
              })
            }
            placeholder="https://example.com/sparkle-bg.gif"
          />
        </label>
        {doc.theme.backgroundImageUrl && (
          <label className="studio-toggle">
            <input
              type="checkbox"
              checked={doc.theme.backgroundTile}
              onChange={(e) =>
                onChange({ ...doc, theme: { ...doc.theme, backgroundTile: e.target.checked } })
              }
            />
            <span>Tile it (repeat the image edge-to-edge, instead of one full-bleed cover image)</span>
          </label>
        )}
        <label className="studio-toggle">
          <input
            type="checkbox"
            checked={doc.theme.marqueeStatus}
            onChange={(e) =>
              onChange({ ...doc, theme: { ...doc.theme, marqueeStatus: e.target.checked } })
            }
          />
          <span>Scroll my status line marquee-style</span>
        </label>
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Themes</legend>
        <p className="studio-hint">
          Share your current look — template, colors, density, font, motion, and custom CSS settings — with
          others in the gallery.
        </p>
        {doc.theme.attribution?.credit && (
          <p className="studio-hint mono">{doc.theme.attribution.credit}</p>
        )}
        <label className="field">
          <span>Theme name</span>
          <input
            type="text"
            maxLength={80}
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            placeholder={`@${handle}'s look`}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            rows={2}
            maxLength={280}
            value={themeDescription}
            onChange={(e) => setThemeDescription(e.target.value)}
            placeholder="What vibe does this theme capture?"
          />
        </label>
        <label className="field">
          <span>Tags</span>
          <input
            type="text"
            value={themeTags}
            onChange={(e) => setThemeTags(e.target.value)}
            placeholder="y2k, neon, minimal"
          />
        </label>
        <button
          type="button"
          className="btn secondary"
          disabled={pending || !themeName.trim()}
          onClick={() => onPublishTheme(themeName, themeDescription, themeTags)}
        >
          Publish theme to gallery
        </button>
      </fieldset>
    </>
  );
}
