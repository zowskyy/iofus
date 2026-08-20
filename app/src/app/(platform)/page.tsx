import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

const FEATURES = [
  {
    title: "Make a page, your way",
    body:
      "Pick a mood, add your name, choose what belongs — identity, links, a status line. Published at your own /@handle URL in minutes.",
  },
  {
    title: "Studio: get lost decorating",
    body:
      "Colors, fonts, layout order, density. Y2K flourishes like tiled backgrounds and a scrolling marquee status line, straight out of 2003 — without losing accessibility.",
  },
  {
    title: "Rich, weird, yours",
    body:
      "Shrines, playlists (link-only, no autoplay), pixel art, mini-pages, a Top 8, badges, a guestbook. The stuff that made personal pages fun.",
  },
  {
    title: "Wander without a feed",
    body:
      "No algorithm deciding what you see. Explore by tag, mood, web ring, curated collection, a surprise button, or by walking the friend graph.",
  },
  {
    title: "Ask Us",
    body:
      "Post a question and reach people outside your friend circle who opt in to help — rate-limited and consent-gated, never a DM inbox.",
  },
  {
    title: "Built to be safe, not just fun",
    body:
      "Reader Mode guarantees every page stays readable. Block, report, and guestbook moderation are always available. No visitor analytics — ever.",
  },
];

const STEPS = [
  { label: "Make", desc: "A short guided flow — pick a mood, say who you are" },
  { label: "Shape", desc: "Studio: colors, layout, modules, custom CSS" },
  { label: "Publish", desc: "Live at your own /@handle URL" },
  { label: "Wander", desc: "Discover other pages, no feed required" },
];

/** Server page rendering the platform landing page — signed-in users see their dashboard, visitors see the public feature overview. */
export default async function HomePage() {
  const viewer = await getCurrentUser();

  if (viewer) {
    return (
      <main className="container">
        <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          iofus
        </p>
        <h1>Welcome back, @{viewer.handle}.</h1>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <Link href={`/@${viewer.handle}`} className="btn">
            View your page
          </Link>
          <Link href="/studio" className="btn secondary">
            Studio
          </Link>
          <Link href="/explore" className="btn secondary">
            Explore
          </Link>
          <Link href="/asks" className="btn secondary">
            Ask Us
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        iofus
      </p>
      <h1>Make your corner of the internet. Keep it yours.</h1>
      <p className="home-lead">
        A personal-page platform where you get lost in the customization — without getting lost in it.
        No feed, no ads, no algorithm, no visitor tracking. Just a page that's actually yours, and a way
        to find people beyond who you already know.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
        <Link href="/signup" className="btn">
          Make your page
        </Link>
        <Link href="/explore" className="btn secondary">
          Explore first
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
        <h2>What's here</h2>
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
        <h2 style={{ marginTop: "2.5rem" }}>Wander without a feed</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", marginBottom: "1rem" }}>
          Explore is live — tags, templates, web rings, collections, friend-graph walks, search, and a surprise button.
        </p>
        <ul className="home-explore-list">
          <li>
            <Link href="/explore">Recently redecorated</Link>
            <span className="home-explore-desc">See what people just published</span>
          </li>
          <li>
            <Link href="/explore">Browse by tag &amp; feeling</Link>
            <span className="home-explore-desc">Follow a tag or template mood</span>
          </li>
          <li>
            <Link href="/explore/random">Surprise me</Link>
            <span className="home-explore-desc">Land on a random public page</span>
          </li>
          <li>
            <Link href="/explore">Web rings &amp; collections</Link>
            <span className="home-explore-desc">Curated lists and classic webring hops</span>
          </li>
          <li>
            <Link href="/explore">Friend graph walks</Link>
            <span className="home-explore-desc">Follow friend links one or two hops out</span>
          </li>
        </ul>
      </section>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "2.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <Link href="/signup" className="btn">
          Make your page
        </Link>
        <Link href="/policy" className="btn secondary">
          Community policy
        </Link>
      </div>
    </main>
  );
}
