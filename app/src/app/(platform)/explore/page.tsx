import "../../explore.css";
import Link from "next/link";
import { ExplorePageList } from "@/components/explore/ExplorePageList";
import { ensureSeedCollections, listCollections } from "@/lib/collections";
import {
  countDecoratedToday,
  listByTemplate,
  listPopularTags,
  listRecentlyPublished,
  searchPages,
} from "@/lib/discovery";
import { ensureSeedRings, listWebRings } from "@/lib/webRings";
import { TEMPLATE_OPTIONS } from "@/lib/templates";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

/** Server page for the public Explore/discovery feed, with tag and text search. */
export default async function ExplorePage({ searchParams }: Props) {
  ensureSeedRings();
  ensureSeedCollections();

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const searchResults = query ? searchPages(query) : [];

  const recent = listRecentlyPublished(12);
  const popularTags = listPopularTags(24);
  const collections = listCollections();
  const rings = listWebRings();
  const decoratedToday = countDecoratedToday();

  const templateSections = TEMPLATE_OPTIONS.map((t) => ({
    ...t,
    pages: listByTemplate(t.id, 4),
  }));

  return (
    <main className="container explore-container">
      <header className="explore-header">
        <p className="mono explore-kicker">Explore</p>
        <h1>Find your people</h1>
        <p className="explore-lead">
          Fresh pages, tags, web rings, curated collections, friend-of-friend walks — pick a path. No algorithm. Just what people actually made.
        </p>
      </header>

      {decoratedToday > 0 && (
        <div className="explore-ambient" aria-live="polite">
          <span className="explore-ambient-dot" aria-hidden="true" />
          {decoratedToday} {decoratedToday === 1 ? "page" : "pages"} redecorated in the last 24h
        </div>
      )}

      <section className="explore-toolbar" aria-label="Search and surprise">
        <form className="explore-search" action="/explore" method="get">
          <label className="explore-search-label" htmlFor="explore-q">Search pages</label>
          <div className="explore-search-row">
            <input
              id="explore-q"
              name="q"
              type="search"
              placeholder="Handle, name, tag, or vibe…"
              defaultValue={query}
              className="explore-search-input"
            />
            <button type="submit" className="btn">Search</button>
          </div>
        </form>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/explore/random" className="btn secondary explore-random-btn">
            Surprise me
          </Link>
          <Link href="/wander" className="btn secondary explore-random-btn">
            Wander mode
          </Link>
        </div>
      </section>

      {query && (
        <section className="explore-section">
          <h2>Search results</h2>
          <p className="explore-section-note">
            {searchResults.length === 0
              ? `No public pages matched “${query}”.`
              : `Matches for “${query}”.`}
          </p>
          <ExplorePageList pages={searchResults} emptyMessage={`No public pages matched “${query}”.`} />
        </section>
      )}

      <section className="explore-section">
        <h2>Recently redecorated</h2>
        <p className="explore-section-note">Fresh paint — pages people updated lately.</p>
        <ExplorePageList pages={recent} emptyMessage="No pages published yet. Be the first." />
      </section>

      {popularTags.length > 0 && (
        <section className="explore-section">
          <h2>Popular tags</h2>
          <p className="explore-section-note">Follow a feeling — each tag opens a browse page.</p>
          <div className="explore-tag-cloud">
            {popularTags.map(({ tag, count }) => (
              <Link
                key={tag}
                href={`/explore/tag/${encodeURIComponent(tag)}`}
                className="explore-tag-cloud-item"
              >
                <span>{tag}</span>
                <span className="mono explore-tag-count">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="explore-section">
        <h2>Browse by feeling</h2>
        <p className="explore-section-note">Each template has its own mood — sample a few corners.</p>
        <div className="explore-template-grid">
          {templateSections.map((t) => (
            <div key={t.id} className="explore-template-block">
              <h3 className="explore-template-name">{t.label}</h3>
              {t.pages.length === 0 ? (
                <p className="explore-empty">No public pages with this template yet.</p>
              ) : (
                <ul className="explore-template-list">
                  {t.pages.map((p) => (
                    <li key={p.handle}>
                      <Link href={`/@${p.handle}`}>{p.displayName}</Link>
                      <span className="mono explore-template-handle">@{p.handle}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {collections.length > 0 && (
        <section className="explore-section">
          <h2>Curated collections</h2>
          <p className="explore-section-note">Hand-picked lists worth wandering through.</p>
          <ul className="explore-curate-list">
            {collections.map((c) => (
              <li key={c.id} className="explore-curate-card">
                <Link href={`/explore/collection/${c.slug}`} className="explore-curate-title">
                  {c.title}
                </Link>
                <p>{c.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rings.length > 0 && (
        <section className="explore-section">
          <h2>Web rings</h2>
          <p className="explore-section-note">Classic webring energy — hop member to member.</p>
          <ul className="explore-curate-list">
            {rings.map((ring) => (
              <li key={ring.id} className="explore-curate-card">
                <Link href={`/explore/ring/${ring.slug}`} className="explore-curate-title">
                  {ring.name}
                </Link>
                <p>{ring.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="explore-section">
        <h2>Theme gallery</h2>
        <p className="explore-section-note">
          Shared looks to install or fork — creator credit and version history included.
        </p>
        <p>
          <Link href="/explore/themes" className="btn secondary">
            Browse themes
          </Link>
        </p>
      </section>
    </main>
  );
}
