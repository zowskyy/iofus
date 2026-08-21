"use client";

import { useState } from "react";
import { PixelArtGridEditor } from "@/components/studio/PixelArtGridEditor";
import type { FriendSummary } from "@/lib/friends";
import type { PageDocument, PixelArtPiece } from "@/lib/pageDocumentTypes";

/** Generates a new random UUID for client-side module identifiers. */
function newId(): string {
  return crypto.randomUUID();
}

/** Resizes a flat pixel array to new dimensions, preserving existing pixels and filling added cells with transparent. */
function resizePixelGrid(
  width: number,
  height: number,
  oldWidth: number,
  oldHeight: number,
  pixels: PixelArtPiece["pixels"],
): PixelArtPiece["pixels"] {
  const next: PixelArtPiece["pixels"] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < oldWidth && y < oldHeight) {
        next.push(pixels[y * oldWidth + x] ?? "transparent");
      } else {
        next.push("transparent");
      }
    }
  }
  return next;
}

/** Returns a blank 8×8 pixel art piece with a generated id and all pixels set to transparent. */
function defaultPixelArtPiece(): PixelArtPiece {
  const width = 8;
  const height = 8;
  return {
    id: newId(),
    title: "New pixel art",
    width,
    height,
    pixels: Array(width * height).fill("transparent") as PixelArtPiece["pixels"],
  };
}

export interface ContentTabProps {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
  friends: FriendSummary[];
}

/** Studio tab for editing all page content: identity, links, modules, Top 8, and more. */
export function ContentTab({ document: doc, onChange, friends }: ContentTabProps) {
  const [tagInput, setTagInput] = useState("");

  /** Normalises the tag input and appends it to the document's tag list if valid and not a duplicate. */
  const addTag = () => {
    const slug = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug || doc.tags.includes(slug) || doc.tags.length >= 10) return;
    onChange({ ...doc, tags: [...doc.tags, slug] });
    setTagInput("");
  };

  return (
    <>
      <h2 className="studio-section-title">Content</h2>
      <p className="studio-hint">Identity, links, media, writing, and tags.</p>

      <fieldset className="studio-fieldset">
        <legend>Identity</legend>
        <label className="field">
          <span>Display name</span>
          <input
            type="text"
            maxLength={60}
            value={doc.identity.displayName}
            onChange={(e) =>
              onChange({ ...doc, identity: { ...doc.identity, displayName: e.target.value } })
            }
          />
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea
            maxLength={280}
            rows={2}
            value={doc.identity.bio}
            onChange={(e) => onChange({ ...doc, identity: { ...doc.identity, bio: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>Status line</span>
          <input
            type="text"
            maxLength={80}
            value={doc.identity.status ?? ""}
            onChange={(e) =>
              onChange({
                ...doc,
                identity: { ...doc.identity, status: e.target.value || undefined },
              })
            }
          />
        </label>
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Now</legend>
        <textarea
          maxLength={280}
          rows={3}
          value={doc.now}
          onChange={(e) => onChange({ ...doc, now: e.target.value })}
          placeholder="What you're focused on right now"
        />
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Links</legend>
        {doc.links.map((link, i) => (
          <div key={i} className="studio-card">
            <label className="field">
              <span>Label</span>
              <input
                type="text"
                maxLength={80}
                value={link.label}
                onChange={(e) => {
                  const links = [...doc.links];
                  links[i] = { ...link, label: e.target.value };
                  onChange({ ...doc, links });
                }}
              />
            </label>
            <label className="field">
              <span>URL</span>
              <input
                type="url"
                value={link.url}
                onChange={(e) => {
                  const links = [...doc.links];
                  links[i] = { ...link, url: e.target.value };
                  onChange({ ...doc, links });
                }}
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, links: doc.links.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.links.length < 30 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                links: [...doc.links, { label: "New link", url: "https://example.com" }],
              })
            }
          >
            Add link
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Gallery</legend>
        {doc.gallery.map((item) => (
          <div key={item.id} className="studio-card">
            <label className="field">
              <span>Image URL</span>
              <input
                type="url"
                value={item.url}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    gallery: doc.gallery.map((g) => (g.id === item.id ? { ...g, url: e.target.value } : g)),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Alt text</span>
              <input
                type="text"
                maxLength={200}
                value={item.alt}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    gallery: doc.gallery.map((g) => (g.id === item.id ? { ...g, alt: e.target.value } : g)),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Caption</span>
              <input
                type="text"
                maxLength={280}
                value={item.caption ?? ""}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    gallery: doc.gallery.map((g) =>
                      g.id === item.id ? { ...g, caption: e.target.value || undefined } : g,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, gallery: doc.gallery.filter((g) => g.id !== item.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.gallery.length < 12 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                gallery: [
                  ...doc.gallery,
                  { id: newId(), url: "https://example.com/image.jpg", alt: "Describe this image" },
                ],
              })
            }
          >
            Add image
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Blog posts</legend>
        {doc.blog.map((post) => (
          <div key={post.id} className="studio-card">
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                maxLength={120}
                value={post.title}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    blog: doc.blog.map((p) => (p.id === post.id ? { ...p, title: e.target.value } : p)),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Slug</span>
              <input
                type="text"
                maxLength={80}
                value={post.slug}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    blog: doc.blog.map((p) => (p.id === post.id ? { ...p, slug: e.target.value } : p)),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Body</span>
              <textarea
                rows={4}
                value={post.body}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    blog: doc.blog.map((p) => (p.id === post.id ? { ...p, body: e.target.value } : p)),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, blog: doc.blog.filter((p) => p.id !== post.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.blog.length < 50 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                blog: [
                  ...doc.blog,
                  {
                    id: newId(),
                    title: "New post",
                    slug: `post-${doc.blog.length + 1}`,
                    body: "Start writing…",
                    publishedAt: new Date().toISOString(),
                  },
                ],
              })
            }
          >
            Add post
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Devlog</legend>
        {doc.devlog.map((entry) => (
          <div key={entry.id} className="studio-card">
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={entry.date.slice(0, 10)}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    devlog: doc.devlog.map((d) =>
                      d.id === entry.id ? { ...d, date: e.target.value } : d,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Entry</span>
              <textarea
                rows={3}
                maxLength={500}
                value={entry.body}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    devlog: doc.devlog.map((d) => (d.id === entry.id ? { ...d, body: e.target.value } : d)),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, devlog: doc.devlog.filter((d) => d.id !== entry.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.devlog.length < 100 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                devlog: [
                  ...doc.devlog,
                  { id: newId(), date: new Date().toISOString().slice(0, 10), body: "Today I…" },
                ],
              })
            }
          >
            Add entry
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Badges</legend>
        {doc.badges.map((badge) => (
          <div key={badge.id} className="studio-card studio-badge-row">
            <label className="field">
              <span>Emoji</span>
              <input
                type="text"
                maxLength={8}
                value={badge.emoji ?? ""}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    badges: doc.badges.map((b) =>
                      b.id === badge.id ? { ...b, emoji: e.target.value || undefined } : b,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Label</span>
              <input
                type="text"
                maxLength={40}
                value={badge.label}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    badges: doc.badges.map((b) => (b.id === badge.id ? { ...b, label: e.target.value } : b)),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, badges: doc.badges.filter((b) => b.id !== badge.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.badges.length < 20 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                badges: [...doc.badges, { id: newId(), label: "New badge" }],
              })
            }
          >
            Add badge
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Top 8</legend>
        <p className="studio-hint">Friend handles to highlight (max 8).</p>
        {doc.topEight.map((friendHandle, i) => (
          <div key={i} className="studio-card studio-top-eight-row">
            <label className="field">
              <span>@{i + 1}</span>
              <input
                type="text"
                maxLength={32}
                value={friendHandle}
                list="studio-friend-handles"
                onChange={(e) => {
                  const topEight = [...doc.topEight];
                  topEight[i] = e.target.value;
                  onChange({ ...doc, topEight });
                }}
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, topEight: doc.topEight.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        <datalist id="studio-friend-handles">
          {friends.map((f) => (
            <option key={f.userId} value={f.handle} />
          ))}
        </datalist>
        {doc.topEight.length < 8 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => onChange({ ...doc, topEight: [...doc.topEight, friends[0]?.handle ?? ""] })}
          >
            Add friend slot
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Shrines</legend>
        <p className="studio-hint">Dedicated spaces for something you love.</p>
        {doc.shrines.map((shrine) => (
          <div key={shrine.id} className="studio-card">
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                maxLength={80}
                value={shrine.title}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    shrines: doc.shrines.map((s) =>
                      s.id === shrine.id ? { ...s, title: e.target.value } : s,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Body</span>
              <textarea
                rows={4}
                maxLength={5000}
                value={shrine.body}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    shrines: doc.shrines.map((s) =>
                      s.id === shrine.id ? { ...s, body: e.target.value } : s,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Image URL (optional)</span>
              <input
                type="url"
                value={shrine.imageUrl ?? ""}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    shrines: doc.shrines.map((s) =>
                      s.id === shrine.id
                        ? { ...s, imageUrl: e.target.value || undefined }
                        : s,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Image alt text (optional)</span>
              <input
                type="text"
                maxLength={200}
                value={shrine.imageAlt ?? ""}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    shrines: doc.shrines.map((s) =>
                      s.id === shrine.id
                        ? { ...s, imageAlt: e.target.value || undefined }
                        : s,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, shrines: doc.shrines.filter((s) => s.id !== shrine.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.shrines.length < 5 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                shrines: [
                  ...doc.shrines,
                  {
                    id: newId(),
                    title: "New shrine",
                    body: "Write about something you love…",
                  },
                ],
              })
            }
          >
            Add shrine
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Playlist</legend>
        <p className="studio-hint">Outbound links only — no embeds or autoplay.</p>
        {doc.playlist.map((track) => (
          <div key={track.id} className="studio-card">
            <label className="field">
              <span>Track title</span>
              <input
                type="text"
                maxLength={120}
                value={track.title}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    playlist: doc.playlist.map((t) =>
                      t.id === track.id ? { ...t, title: e.target.value } : t,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>URL</span>
              <input
                type="url"
                value={track.url}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    playlist: doc.playlist.map((t) =>
                      t.id === track.id ? { ...t, url: e.target.value } : t,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, playlist: doc.playlist.filter((t) => t.id !== track.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.playlist.length < 20 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                playlist: [
                  ...doc.playlist,
                  { id: newId(), title: "New track", url: "https://example.com/track" },
                ],
              })
            }
          >
            Add track
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Pixel art</legend>
        <p className="studio-hint">Small owner-made grids — default 8×8, up to 24×24.</p>
        {doc.pixelArt.map((piece) => (
          <div key={piece.id} className="studio-card">
            <label className="field">
              <span>Title (optional)</span>
              <input
                type="text"
                maxLength={80}
                value={piece.title ?? ""}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    pixelArt: doc.pixelArt.map((p) =>
                      p.id === piece.id ? { ...p, title: e.target.value || undefined } : p,
                    ),
                  })
                }
              />
            </label>
            <div className="studio-pixel-size-row">
              <label className="field">
                <span>Width</span>
                <input
                  type="number"
                  min={4}
                  max={24}
                  value={piece.width}
                  onChange={(e) => {
                    const width = Math.min(24, Math.max(4, Number(e.target.value) || 4));
                    onChange({
                      ...doc,
                      pixelArt: doc.pixelArt.map((p) =>
                        p.id === piece.id
                          ? {
                              ...p,
                              width,
                              pixels: resizePixelGrid(width, p.height, p.width, p.height, p.pixels),
                            }
                          : p,
                      ),
                    });
                  }}
                />
              </label>
              <label className="field">
                <span>Height</span>
                <input
                  type="number"
                  min={4}
                  max={24}
                  value={piece.height}
                  onChange={(e) => {
                    const height = Math.min(24, Math.max(4, Number(e.target.value) || 4));
                    onChange({
                      ...doc,
                      pixelArt: doc.pixelArt.map((p) =>
                        p.id === piece.id
                          ? {
                              ...p,
                              height,
                              pixels: resizePixelGrid(p.width, height, p.width, p.height, p.pixels),
                            }
                          : p,
                      ),
                    });
                  }}
                />
              </label>
            </div>
            <PixelArtGridEditor
              piece={piece}
              onChange={(pixels) =>
                onChange({
                  ...doc,
                  pixelArt: doc.pixelArt.map((p) => (p.id === piece.id ? { ...p, pixels } : p)),
                })
              }
            />
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, pixelArt: doc.pixelArt.filter((p) => p.id !== piece.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.pixelArt.length < 10 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => onChange({ ...doc, pixelArt: [...doc.pixelArt, defaultPixelArtPiece()] })}
          >
            Add pixel art
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Mini-pages</legend>
        <p className="studio-hint">Linked sub-pages at /@you/p/slug</p>
        {doc.miniPages.map((page) => (
          <div key={page.id} className="studio-card">
            <label className="field">
              <span>Slug</span>
              <input
                type="text"
                maxLength={80}
                value={page.slug}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    miniPages: doc.miniPages.map((p) =>
                      p.id === page.id ? { ...p, slug: e.target.value } : p,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                maxLength={120}
                value={page.title}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    miniPages: doc.miniPages.map((p) =>
                      p.id === page.id ? { ...p, title: e.target.value } : p,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Intro</span>
              <textarea
                rows={2}
                maxLength={500}
                value={page.intro}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    miniPages: doc.miniPages.map((p) =>
                      p.id === page.id ? { ...p, intro: e.target.value } : p,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Body</span>
              <textarea
                rows={4}
                maxLength={20000}
                value={page.body}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    miniPages: doc.miniPages.map((p) =>
                      p.id === page.id ? { ...p, body: e.target.value } : p,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, miniPages: doc.miniPages.filter((p) => p.id !== page.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.miniPages.length < 10 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                miniPages: [
                  ...doc.miniPages,
                  {
                    id: newId(),
                    slug: `page-${doc.miniPages.length + 1}`,
                    title: "New mini-page",
                    intro: "",
                    body: "",
                  },
                ],
              })
            }
          >
            Add mini-page
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Tags</legend>
        <div className="studio-tag-row">
          <input
            type="text"
            maxLength={30}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="e.g. art, zines"
          />
          <button type="button" className="btn secondary" onClick={addTag}>Add</button>
        </div>
        <ul className="studio-tag-list">
          {doc.tags.map((tag) => (
            <li key={tag}>
              <span className="mono">{tag}</span>
              <button
                type="button"
                className="studio-icon-btn"
                onClick={() => onChange({ ...doc, tags: doc.tags.filter((t) => t !== tag) })}
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  );
}
