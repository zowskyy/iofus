# iofus

**Get lost in decorating, not in menus.**

iofus is a modern, safer MySpace-style home on the web. Every person gets a profile page they can radically customize — colors, layout, guestbooks, shrines, pixel art, playlists, blogs, and more — and share at a simple URL like `@yourname`. There's no infinite feed, no engagement scores, and no algorithm deciding what you see next. You find people by wandering, by tags, by web rings, and by walking a real friend graph on your own terms.

> Make your corner of the internet. Wander into someone else's.

The core question is never *"what are you posting today?"* It's:

> **What does your corner of the internet feel like?**

```text
Make → Shape → Publish → Wander
```

---

## What it actually is

Picture the internet before it got optimized for you: GeoCities' glorious chaos, MySpace's Top 8 diplomacy, Tumblr's aesthetic-blog era, the guestbook at the bottom of someone's fan page. iofus rebuilds that — on purpose, with modern engineering under the hood, so a page can be as loud and personal as its owner wants without becoming a security incident.

It is **not** a website builder, not a code sandbox, and not social media with feeds, trends, or ad-optimized engagement loops. A profile is a structured, versioned document — theme + content + module choices — not raw HTML. That's the one architectural decision that makes everything else possible: pages can be as expressive as CSS allows, and still can't run a script, hijack a redirect, or hide the safety controls.

---

## The screens

Four core screens carry the whole product. No notification-center-as-homepage, no creator analytics dashboard pretending to be a feature.

| Screen | Verb | What it's for |
|---|---|---|
| **Explore** | Wander | Discover pages by tag, web ring, random roll, or walking the friend graph |
| **Make** | Create | A short guided flow — pick a mood, add your name, choose what belongs on your page. Under five minutes, on purpose. |
| **My Page** | Publish | Your public space at `@yourhandle` |
| **Studio** | Shape | Five tabs — Look, Layout, Content, Access, Publish — colors, fonts, section order, gallery, guestbook, and more |

Once you're in the door, there's more to find:

- **Ask Us** — post something you need help with, and anyone in the matching pool (never a named individual) can answer. It's the one deliberate way to reach *outside* your existing friend graph, opt-in, rate-limited, and never algorithmic.
- **Messages** — real 1:1 threads, AIM-window styled, with the same block/rate-limit guardrails as everywhere else. A narrow, on-purpose exception to "no DMs" — see [`PLAN.md`](PLAN.md) for the story of why that rule got revisited instead of quietly broken.
- **Rings** — join, create, and manage web rings: the old-web way of saying "these pages belong together."
- **Wander mode** — a full-screen, proximity-ordered way to surf profiles one after another, like flipping through a stack of zines someone handed you.
- **Vibe Graph** — a radial map of your proximity graph (built from guestbook signs and ring joins, never passive page views) with everyone's ambient status attached.
- **Feed** — chronological updates from your *friends specifically*, nothing algorithmic, nothing from strangers, and not the app's front door.

Friends are a real, visible, mutual-accept graph you browse outward from — discovery by choice, never a feed you're fed.

---

## Page parts

Not "widgets." The actual things people used to fill a personal page with, each shipping with a mobile layout, a Reader Mode fallback, keyboard support, and privacy settings from day one:

**Identity** · **Friends** · **Links** · **Now** · **Gallery** · **Blog** · **Devlog** · **Guestbook** · **Top 8** · **Badges** · **Shrine** · **Playlist** (outbound links only — no autoplay, no embedded players) · **Pixel Art** · **Mini-page**

Top 8 draws *from* your Friends graph — it's a curated highlight reel, not a second list to maintain.

---

## Safety, by construction

A profile can be loud, strange, and dense with personality. It cannot become a website that runs code.

- **No arbitrary HTML or JavaScript in pages** — ever. Custom CSS is scoped, denylisted against known escape tricks, and validated on every save.
- **Reader Mode** strips decoration down to clean, readable content on any page — a theme can't hide it, override it, or hide the Reader/Report/Block bar sitting above it.
- **No visitor analytics.** Creators don't get page views, referrers, or visitor tracking of any kind. Written into [`PLAN.md`](PLAN.md) as a decision that's "not revisited quietly later" — and meant.
- Block and report are always visible, friend requests require mutual accept, guestbook entries need owner approval by default, and every mutating action is rate-limited.

---

## Quick start

iofus runs as a Next.js app in `app/`. You need **Node.js 22.5+** (it uses `node:sqlite` — no separate database install).

```bash
cd app
npm install
npm test
npm run build
npm run start
```

Then open the app in your browser (default: `http://localhost:3000`).

For local development with hot reload:

```bash
npm run dev
```

---

## What's shipped

Phases 1 through 5 are complete and hardened; Phases 6 and 7 shipped as deliberate, guardrailed reversals of earlier "never" decisions — see [`PLAN.md`](PLAN.md) for the full roadmap and the reasoning behind each one.

**Phase 1 — Make a page.** Accounts and handles, identity/links/now/friends page parts, mutual-accept friend requests, six starter templates, public profile URL, mobile renderer, Reader Mode, publish/unpublish.

**Phase 2 — Shape a page.** The full five-tab Studio, theme controls, page-part ordering, desktop/mobile preview, undo, save and restore versions, gallery/blog/devlog/badges/Top 8.

**Phase 3 — Keep it safe.** Image descriptions, contrast warnings, reduced-motion support, Safe Preview, export/import, visibility controls, block and report, guestbook approval, rate limits, moderator queue, community policy, appeals, panic mode.

**Phase 4 — Wander.** Recently decorated pages, tags, curated collections, random page, web rings, friend-graph browsing, guestbooks with approval.

**Phase 5 — Rich modules and shared themes.** Shrine, Playlist, Pixel Art, and Mini-page modules; a theme gallery you can install from and fork, with attribution and version history; scoped custom CSS; one-click creative sparks.

**Phase 5.5 — Y2K/Tumblr-era expressiveness.** Tiled or full-bleed background images, a scrolling marquee status line (silently disabled the moment Reduce Motion is on — no separate override to forget).

**Phase 6 — Ask Us.** Reach people outside your friend graph on your own terms: opt-in reachability, rate-limited asks, sensitive asks restricted to your actual friends rather than the open pool, anonymous-to-everyone-but-you posting.

**Phase 7 — Messages.** Real 1:1 threads with their own guardrails distinct from Ask Us's — blocks always win, new-conversation starts are rate-limited, no read receipts are ever exposed to the other person.

The test suite currently covers **238 tests** across validation, moderation, discovery, themes, friend-graph and messaging invariants, and adversarial edge cases.

---

## Production deploy

Set the moderator account before or right after your first user signs up:

```bash
IOFUS_MODERATOR_HANDLE=yourmodhandle
```

On startup, if no moderator exists yet, iofus promotes the account with that handle to moderator (the account must already exist). This is the recommended production path.

| Variable | Purpose |
|----------|---------|
| `IOFUS_MODERATOR_HANDLE` | Handle of the account to promote as moderator on first boot |
| `IOFUS_DB_PATH` | Path to the SQLite database file (default: `app/iofus.db`) |
| `IOFUS_AUTO_MODERATOR_SEED` | Set to `true` to promote the first registered user as moderator if no handle is configured (development only) |

---

## Deeper detail

| Document | What it covers |
|----------|----------------|
| [`PLAN.md`](PLAN.md) | Full product vision, roadmap, safety rules, and the reasoning behind every "never, actually" reversal |
| [`docs/architecture.md`](docs/architecture.md) | App structure, data flow, module registry, and persistence |
| [`docs/profile-schema.md`](docs/profile-schema.md) | Page document schema and page parts |
| [`docs/security-model.md`](docs/security-model.md) | XSS prevention, untrusted content handling, and safety boundaries |
| [`docs/accessibility.md`](docs/accessibility.md) | Reader Mode, WCAG targets, and accessibility guarantees |
| [`docs/theme-api.md`](docs/theme-api.md) | Theme tokens, scoped CSS, and the shared theme gallery |

---

## What iofus is not (V1)

No infinite feed · no arbitrary HTML or JavaScript in pages · no third-party embeds · no autoplay music · no plugin marketplace · no AI-generated pages · no federation or self-hosting controls at launch · no recommendation algorithms.

Messages is the one deliberate, narrow exception to "no DMs," built with its own safety model rather than quietly relaxing the rule (see the roadmap in [`PLAN.md`](PLAN.md)). Everything else on this list still stands.

iofus stays ambitious by making expressive personal publishing simple, durable, safe, and accessible — not by shipping every possible social feature.

---

## A note on the name

iofus — a play on "Internet of Us" — started as Webroom, a page-of-your-own platform. The rename marks a direction, not just a rebrand: everyone should get a piece of the internet to call their own (the page you already get today) *and* a way to reach people beyond who they already know when they actually need to. See [`PLAN.md`](PLAN.md)'s "A note on the name" for the research this idea actually comes from, and the roadmap above for what it means in practice.

---

> Make your corner of the internet. Keep it yours.
