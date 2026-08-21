import "../explore.css";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getFriendActivityFeed, type FeedItem } from "@/lib/activityFeed";

const FEATURES = [
  {
    title: "Claim your wall",
    body:
      "Your /@handle is your spot. Throw up your name, your links, your vibe. It's live in minutes and it's actually yours — not rented, not templated to death.",
  },
  {
    title: "Go deep in the studio",
    body:
      "Colors, layouts, tiled backgrounds, marquee status bars, custom CSS. Spend an hour in there. That's the point. No two pages look the same.",
  },
  {
    title: "Shrines. Pixel art. Playlists. All of it.",
    body:
      "Dedicate a shrine to whatever you're obsessed with. Drop pixel art. Build mini-pages. Sign guestbooks. The weird stuff is first-class here.",
  },
  {
    title: "No feed. No algorithm.",
    body:
      "Explore by tag, mood, web ring, or just hit the random button and land somewhere unexpected. Nobody's curating your discovery for engagement.",
  },
  {
    title: "Ask the community",
    body:
      "Post a question — skill, knowledge, perspective. Reach people outside your circle who opt in to help. Not a DM inbox. Not a broadcast. Something in between.",
  },
  {
    title: "Your page, your rules",
    body:
      "Block, moderate your guestbook, go private, panic-button the whole thing. No one's tracking your visitors. No analytics sold to anyone. Ever.",
  },
];

const STEPS = [
  { label: "Claim", desc: "Pick your handle. Say who you are." },
  { label: "Build", desc: "Studio: colors, layout, shrines, custom CSS" },
  { label: "Drop", desc: "Live at /@yourhandle. Your corner of the net." },
  { label: "Wander", desc: "Find other pages. No algorithm. No feed." },
];

/** Server page rendering the platform landing page — signed-in users see their dashboard, visitors see the public feature overview. */
export default async function HomePage() {
  const viewer = await getCurrentUser();

  if (viewer) {
    const feedItems = getFriendActivityFeed(viewer.id, 5);
    return (
      <main className="container">
        <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          iofus
        </p>
        <h1>Back on the wall, @{viewer.handle}.</h1>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <Link href={`/@${viewer.handle}`} className="btn">
            Your page
          </Link>
          <Link href="/studio" className="btn secondary">
            Studio
          </Link>
          <Link href="/explore" className="btn secondary">
            Wander
          </Link>
          <Link href="/asks" className="btn secondary">
            Ask the crew
          </Link>
        </div>

        {feedItems.length > 0 && (
          <section style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>
              Recent from friends{" "}
              <Link href="/feed" style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--ink-soft)" }}>
                See all
              </Link>
            </h2>
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {feedItems.map((item: FeedItem, i: number) => (
                <li key={i} style={{ padding: "0.4rem 0", borderBottom: "1px solid var(--rule)", fontSize: "0.9rem" }}>
                  <Link href={`/@${item.actorHandle}`} style={{ fontWeight: 600 }}>
                    @{item.actorHandle}
                  </Link>{" "}
                  <Link href={item.href} style={{ color: "var(--ink-soft)" }}>
                    {item.kind === "page_decorated" && "redecorated their page"}
                    {item.kind === "blog_post" && `posted: ${item.title ?? ""}`}
                    {item.kind === "devlog_entry" && "added a devlog entry"}
                    {item.kind === "guestbook_signed" && `signed @${item.targetHandle}'s guestbook`}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        iofus
      </p>
      <h1>This is your wall. Tag it up.</h1>
      <p className="home-lead">
        No feed. No ads. No algorithm watching you. Just your /@handle, your way —
        shrines, playlists, pixel art, whatever you're actually about.
        Find people. Build something weird. Keep it real.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
        <Link href="/signup" className="btn">
          Claim your spot
        </Link>
        <Link href="/explore" className="btn secondary">
          See what's out there
        </Link>
      </div>

      <section className="splash-steps" aria-label="How it works">
        <ol className="splash-steps-list">
          {STEPS.map((s, i) => (
            <li key={s.label}>
              <span className="splash-step-number mono">{i + 1}</span>
              <span className="splash-step-label">{s.label}</span>
              <span className="splash-step-desc">{s.desc}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="splash-features" aria-label="What you can do">
        <h2>What you get</h2>
        <div className="splash-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="splash-feature-card">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-explore" aria-label="Explore highlights">
        <h2 style={{ marginTop: "2.5rem" }}>Find your people</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", marginBottom: "1rem" }}>
          Tags, web rings, curated collections, friend-of-friend walks, a random button. No algorithm. Just actual discovery.
        </p>
        <ul className="home-explore-list">
          <li>
            <Link href="/explore">Fresh paint</Link>
            <span className="home-explore-desc">Pages people just updated</span>
          </li>
          <li>
            <Link href="/explore">Browse by tag</Link>
            <span className="home-explore-desc">Follow a tag or a vibe</span>
          </li>
          <li>
            <Link href="/explore/random">Random</Link>
            <span className="home-explore-desc">Land somewhere unexpected</span>
          </li>
          <li>
            <Link href="/explore">Web rings &amp; collections</Link>
            <span className="home-explore-desc">Curated lists, classic ring hops</span>
          </li>
          <li>
            <Link href="/explore">Friend-of-friend walk</Link>
            <span className="home-explore-desc">Step through the graph. See who's two hops out.</span>
          </li>
        </ul>
      </section>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "2.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <Link href="/signup" className="btn">
          Claim your spot
        </Link>
        <Link href="/policy" className="btn secondary">
          Community rules
        </Link>
      </div>
    </main>
  );
}
