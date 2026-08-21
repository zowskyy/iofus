"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { PageRenderer, type TopEightLink } from "@/components/PageRenderer";
import { WonderStrip } from "@/components/studio/WonderStrip";
import { LookTab } from "@/components/studio/LookTab";
import { LayoutTab } from "@/components/studio/LayoutTab";
import { ContentTab } from "@/components/studio/ContentTab";
import { AccessTab } from "@/components/studio/AccessTab";
import { PublishTab } from "@/components/studio/PublishTab";
import type { FriendSummary } from "@/lib/friends";
import type { GuestbookEntry } from "@/lib/guestbook";
import { applyCreativeSpark, type CreativeSparkId } from "@/lib/creativeSparks";
import type { PageDocument, StoredPage } from "@/lib/pageDocumentTypes";
import { getContrastWarnings } from "@/lib/pageDocumentTheme";
import {
  clearStampsAction,
  exportPageAction,
  importPageAction,
  publishDraftAction,
  publishThemeAction,
  restoreVersionAction,
  saveAndPublishAction,
  saveDraftAction,
  setGuestbookDisabledAction,
  setHiddenFromDiscoveryAction,
  setPublishedAction,
  setVisibilityAction,
} from "./actions";

const MAX_UNDO = 20;

type TabId = "look" | "layout" | "content" | "access" | "publish" | "preview";

const TABS: { id: TabId; label: string; mobileOnly?: boolean }[] = [
  { id: "look", label: "Look" },
  { id: "layout", label: "Layout" },
  { id: "content", label: "Content" },
  { id: "access", label: "Access" },
  { id: "publish", label: "Publish" },
  { id: "preview", label: "Preview", mobileOnly: true },
];

/** Builds the live Top Eight preview list from the current handle selections and the user's friend list. */
function buildTopEightPreview(handles: string[], friends: FriendSummary[]): TopEightLink[] {
  return handles.map((handle) => ({
    handle,
    label: friends.find((f) => f.handle === handle)?.handle ?? handle,
  }));
}

export interface StudioClientProps {
  initialDocument: PageDocument;
  publishedDocument: PageDocument;
  hasDraft: boolean;
  isPublished: boolean;
  visibility: StoredPage["visibility"];
  hiddenFromDiscovery: boolean;
  guestbookDisabled: boolean;
  versions: { id: string; createdAt: string }[];
  handle: string;
  friends: FriendSummary[];
  guestbookEntries: GuestbookEntry[];
}

/** Interactive client component for the page editor Studio, managing draft state, live preview, and all module editors. */
export function StudioClient({
  initialDocument,
  publishedDocument,
  hasDraft: initialHasDraft,
  isPublished: initialIsPublished,
  visibility: initialVisibility,
  hiddenFromDiscovery: initialHiddenFromDiscovery,
  guestbookDisabled: initialGuestbookDisabled,
  versions: initialVersions,
  handle,
  friends,
  guestbookEntries,
}: StudioClientProps) {
  const [document, setDocument] = useState<PageDocument>(initialDocument);
  const [publishedDoc, setPublishedDoc] = useState<PageDocument>(publishedDocument);
  const [undoStack, setUndoStack] = useState<PageDocument[]>([]);
  const [tab, setTab] = useState<TabId>("look");
  const [previewMobile, setPreviewMobile] = useState(false);
  const [safePreview, setSafePreview] = useState(true);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [hiddenFromDiscovery, setHiddenFromDiscovery] = useState(initialHiddenFromDiscovery);
  const [guestbookDisabled, setGuestbookDisabled] = useState(initialGuestbookDisabled);
  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  const [versions, setVersions] = useState(initialVersions);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const previewDocument = safePreview ? document : publishedDoc;
  /** Contrast ratio warnings for the current document's color palette. */
  const contrastWarnings = useMemo(() => getContrastWarnings(document), [document]);
  /** Top-eight links rendered from the preview document for the live preview pane. */
  const previewTopEight = useMemo(
    () => buildTopEightPreview(previewDocument.topEight, friends),
    [previewDocument.topEight, friends],
  );

  /** Saves the current document on the undo stack and updates the working document to *next*. */
  const commitEdit = useCallback(
    (next: PageDocument) => {
      setUndoStack((prev) => {
        const stack = [...prev, document];
        while (stack.length > MAX_UNDO) stack.shift();
        return stack;
      });
      setDocument(next);
      setMessage(null);
      setError(null);
    },
    [document],
  );

  /** Reverts the document to the previous undo stack entry. */
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    setUndoStack((stack) => stack.slice(0, -1));
    setDocument(prev);
    setMessage("Undid last change.");
    setError(null);
  }, [undoStack]);

  /** Runs *fn* inside a transition, displaying *label* as a success message and surfacing any returned error. */
  const runAction = useCallback(
    (label: string, fn: () => Promise<{ ok?: boolean; error?: string; document?: PageDocument; exportJson?: string }>) => {
      startTransition(async () => {
        setMessage(null);
        setError(null);
        const result = await fn();
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.document) {
          setDocument(result.document);
          setPublishedDoc(result.document);
          setUndoStack([]);
        }
        setMessage(label);
      });
    },
    [],
  );

  /** Saves the current editor state as a draft without publishing it. */
  const saveDraft = () => {
    runAction("Draft saved — safe to preview without publishing.", () =>
      saveDraftAction(JSON.stringify(document)).then((r) => {
        if (r.ok) setHasDraft(true);
        return r;
      }),
    );
  };

  /** Saves and immediately publishes the current editor state, discarding any pending draft. */
  const saveAndPublish = () => {
    runAction("Published live.", () =>
      saveAndPublishAction(JSON.stringify(document)).then((r) => {
        if (r.ok) setHasDraft(false);
        return r;
      }),
    );
  };

  /** Publishes the saved draft and updates the editor state to the newly published document. */
  const publishExistingDraft = () => {
    runAction("Draft published live.", () =>
      publishDraftAction().then((r) => {
        if (r.ok && r.document) {
          setDocument(r.document);
          setPublishedDoc(r.document);
          setHasDraft(false);
        }
        return r;
      }),
    );
  };

  /** Exports the current page document as a JSON file download. */
  const handleExport = () => {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const result = await exportPageAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.exportJson) return;
      const blob = new Blob([result.exportJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `iofus-${handle}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded.");
    });
  };

  /** Reads *file*, imports it as the current page document, and publishes it immediately. */
  const handleImport = (file: File) => {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const text = await file.text();
      const result = await importPageAction(text);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.document) {
        setDocument(result.document);
        setPublishedDoc(result.document);
        setUndoStack([]);
        setHasDraft(false);
      }
      setMessage("Import applied and published.");
    });
  };

  /** Restores a previously saved version by *versionId* and reloads the editor state. */
  const restoreVersion = (versionId: string) => {
    runAction("Version restored.", () =>
      restoreVersionAction(versionId).then((r) => {
        if (r.ok) {
          setHasDraft(false);
          setVersions((v) => {
            const exists = v.some((item) => item.id === versionId);
            if (exists) return v;
            return [{ id: versionId, createdAt: new Date().toISOString() }, ...v];
          });
        }
        return r;
      }),
    );
  };

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div>
          <p className="studio-kicker mono">Studio</p>
          <h1>Decorate your corner</h1>
          <p className="studio-subtitle">
            @{handle} · imagination is the only limit — the preview updates as you play
          </p>
        </div>
        <div className="studio-header-actions">
          <button type="button" className="btn secondary" onClick={undo} disabled={undoStack.length === 0 || pending}>
            Undo
          </button>
          <button type="button" className="btn secondary" onClick={saveDraft} disabled={pending}>
            Save draft
          </button>
          <button type="button" className="btn" onClick={saveAndPublish} disabled={pending}>
            Publish
          </button>
        </div>
      </header>

      {(message || error) && (
        <div className={error ? "error-banner" : "studio-message"} role={error ? "alert" : "status"}>
          {error ?? message}
        </div>
      )}

      <WonderStrip
        disabled={pending}
        onSpark={(id: CreativeSparkId) => {
          commitEdit(applyCreativeSpark(id, document));
          setMessage("Spark applied — keep going.");
        }}
      />

      <div className="studio-body">
        <div className="studio-panel">
          <nav className="studio-tabs" aria-label="Studio sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={[
                  tab === t.id ? "studio-tab active" : "studio-tab",
                  t.mobileOnly ? "studio-tab-mobile-only" : "",
                ].join(" ").trim()}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="studio-tab-panel">
            {tab === "preview" && (
              <div className="studio-mobile-preview">
                <div className="studio-preview-toolbar">
                  <span className="mono" style={{ fontSize: "0.8rem" }}>Live preview</span>
                  <div className="studio-preview-toggles">
                    <button
                      type="button"
                      className={!previewMobile ? "studio-chip active" : "studio-chip"}
                      onClick={() => setPreviewMobile(false)}
                    >
                      Desktop
                    </button>
                    <button
                      type="button"
                      className={previewMobile ? "studio-chip active" : "studio-chip"}
                      onClick={() => setPreviewMobile(true)}
                    >
                      Mobile
                    </button>
                  </div>
                </div>
                <div className={previewMobile ? "studio-preview-frame mobile" : "studio-preview-frame desktop"}>
                  <PageRenderer
                    document={previewDocument}
                    friends={friends}
                    handle={handle}
                    readerMode={false}
                    guestbookEntries={guestbookEntries}
                    topEightLinks={previewTopEight}
                  />
                </div>
                <p className="studio-preview-note mono">
                  {safePreview ? "Showing your current edits" : "Showing what's live"}
                  {" · "}
                  <Link href={`/@${handle}`}>Open page</Link>
                </p>
              </div>
            )}
            {tab === "look" && (
              <LookTab
                document={document}
                onChange={commitEdit}
                handle={handle}
                pending={pending}
                onPublishTheme={(name, description, tags) =>
                  runAction("Theme published to gallery.", () => publishThemeAction(name, description, tags))
                }
              />
            )}
            {tab === "layout" && (
              <LayoutTab document={document} onChange={commitEdit} />
            )}
            {tab === "content" && (
              <ContentTab document={document} onChange={commitEdit} friends={friends} />
            )}
            {tab === "access" && (
              <AccessTab
                document={document}
                onChange={commitEdit}
                warnings={contrastWarnings}
                handle={handle}
              />
            )}
            {tab === "publish" && (
              <PublishTab
                document={document}
                onChange={commitEdit}
                isPublished={isPublished}
                visibility={visibility}
                hiddenFromDiscovery={hiddenFromDiscovery}
                guestbookDisabled={guestbookDisabled}
                hasDraft={hasDraft}
                safePreview={safePreview}
                versions={versions}
                pending={pending}
                onSafePreviewChange={setSafePreview}
                onPublishToggle={(published) =>
                  runAction(published ? "Page is live." : "Page unpublished.", () =>
                    setPublishedAction(published).then((r) => {
                      if (r.ok) setIsPublished(published);
                      return r;
                    }),
                  )
                }
                onVisibilityChange={(v) =>
                  runAction(`Visibility set to ${v}.`, () =>
                    setVisibilityAction(v).then((r) => {
                      if (r.ok) setVisibility(v);
                      return r;
                    }),
                  )
                }
                onHiddenChange={(hidden) =>
                  runAction(hidden ? "Hidden from discovery." : "Visible in discovery.", () =>
                    setHiddenFromDiscoveryAction(hidden).then((r) => {
                      if (r.ok) setHiddenFromDiscovery(hidden);
                      return r;
                    }),
                  )
                }
                onGuestbookDisabledChange={(disabled) =>
                  runAction(disabled ? "Guestbook disabled." : "Guestbook enabled.", () =>
                    setGuestbookDisabledAction(disabled).then((r) => {
                      if (r.ok) setGuestbookDisabled(disabled);
                      return r;
                    }),
                  )
                }
                onPublishDraft={publishExistingDraft}
                onExport={handleExport}
                onImport={handleImport}
                onRestoreVersion={restoreVersion}
                onClearStamps={() =>
                  runAction("All stamps cleared.", () => clearStampsAction())
                }
              />
            )}
          </div>
        </div>

        <aside className="studio-preview" aria-label="Live preview">
          <div className="studio-preview-toolbar">
            <span className="mono">Preview</span>
            <div className="studio-preview-toggles">
              <button
                type="button"
                className={!previewMobile ? "studio-chip active" : "studio-chip"}
                onClick={() => setPreviewMobile(false)}
              >
                Desktop
              </button>
              <button
                type="button"
                className={previewMobile ? "studio-chip active" : "studio-chip"}
                onClick={() => setPreviewMobile(true)}
              >
                Mobile
              </button>
            </div>
          </div>
          <div className={previewMobile ? "studio-preview-frame mobile" : "studio-preview-frame desktop"}>
            <PageRenderer
              document={previewDocument}
              friends={friends}
              handle={handle}
              readerMode={false}
              guestbookEntries={guestbookEntries}
              topEightLinks={previewTopEight}
            />
          </div>
          <p className="studio-preview-note mono">
            {safePreview ? "Showing your current edits" : "Showing what's live"}
            {" · "}
            <Link href={`/@${handle}`}>Open page</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
