# iofus

**A modern, safer MySpace-style social network.** Every person gets a
profile-page home they can radically customize, discover through browsing
and friend links, and fill with digital artifacts — music, badges,
guestbook entries, shrines, pixel art, playlists, blogs, and mini-pages.
The goal is to preserve creative ownership and imperfect personality,
while making customization approachable, reversible, mobile-friendly, and
safe.

> Make your corner of the internet. Keep it yours.

The core question is never *"what are you posting today?"* It's:

> **What does your corner of the internet feel like?**

```
Make → Shape → Publish → Wander
```

iofus lives in its own repository (`zowskyy/iofus`), separate from
`gateway-probe`. It started life as Webroom, built inside the `gateway-probe`
repo before this repo existed — see "A note on the name" at the bottom for
what the rename means and doesn't mean.

## What it is

Not social media with feeds, DMs, trends, short-form video, ads, and
engagement scores. Not a full website builder or code sandbox either.

It's the blend MySpace-era personal publishing actually was, rebuilt safe
and modern:

- MySpace profiles and Top 8
- Neocities/GeoCities-style personal sites
- Tumblr-era fandom and aesthetic blogging
- Early-web guestbooks, web rings, blinkies, and badges
- Modern component editing, live previews, accessibility checks, and
  responsive design

**Core concept — Personal Webspaces.** Each account gets a customizable
URL (`iofus.example/@yourname`) and a profile built from editable
modules, not a fixed feed template. People find each other by browsing,
by wandering discovery paths, and by **friend links** — a real, visible
social graph, not a follower count optimized for growth.

Accessibility is part of the product contract, not a later feature: every
page needs a readable, keyboard-usable fallback even when its decoration
is highly expressive (WCAG 2.2 is the relevant standard here).

## The four screens, and nothing else in V1

| Screen | Verb | Purpose |
|---|---|---|
| **Explore** | Wander | Discover pages by tag, web ring, random, and friend links |
| **Make** | Create | Start a page from a short guided flow |
| **My Page** | Publish | View and share your public space |
| **Studio** | Shape | Change appearance, content, and layout |

No infinite feed, marketplace, DMs, trend screen, notification center,
creator-analytics dashboard, plugin screen, or federation controls in V1.
Friends are a graph you browse, not a feed you're fed.

## First five minutes

1. **Pick a feeling** — Soft Web, Pixel Tavern, Chrome Angel, Dark Zine,
   Clean Portfolio, or start simple. A starting mood, not a final answer.
2. **Add your name and one sentence.** That's the whole "who are you" step.
3. **Pick what belongs on your page** — about me, links, what you're
   making, gallery, guestbook, friends, top 8, badges.
4. **Publish.** Live at `iofus/@yourname`. Keep editing any time.

A first-time user should be able to publish a readable page in under five
minutes — that's the Phase 1 success test below, not just a nice-to-have.

## Page parts

Not "widgets" — the actual things people put in their own space. Each one
ships with a mobile layout, a Reader Mode version, keyboard support, and
privacy settings from day one:

**Identity** (name, avatar, bio, status) · **Friends** (the real social
graph — sent/accepted links, publicly browsable) · **Links** (curated
external links) · **Now** (what you're making, playing, feeling) ·
**Gallery** (a few images with descriptions) · **Blog** (longer posts,
own permalink, own feed) · **Devlog** (short dated updates) · **Guestbook**
(owner-approved messages) · **Top 8** (a curated highlight reel pulled
from your Friends, not a separate list to maintain) · **Badges** (stamps,
collections, web rings) · **Shrine** (a dedicated small page devoted to
one thing you love) · **Playlist** (an ordered list of tracks/embeds, no
autoplay) · **Pixel Art** (a small canvas of owner-made or collected pixel
pieces) · **Mini-page** (a linked sub-page with its own layout — for a
project, an event, a shrine that outgrew a module)

Friends and Top 8 are related but distinct: **Friends** is the real graph
— the thing people actually link to and browse through. **Top 8** is a
curated *subset* of your friends you choose to feature, exactly like the
original — it draws from the graph, it doesn't duplicate it.

## The Studio

Five tabs, no freeform drag-everything canvas. Ordered sections produce
better pages, work better on mobile, and stay accessible by construction.

**Look** (colors, background, text style, mood) · **Layout** (section
order, spacing, density) · **Content** (name, bio, links, gallery, blog,
guestbook, friends) · **Access** (Reader Mode, contrast, motion, alt
text) · **Publish** (save, share, restore a version, export)

## The underlying layer: what this inherits from gateway-probe

A iofus page is not a tiny custom website — it's a structured, versioned
document: profile data + theme choices + approved page parts + assets.
That decision is what makes the rest of the product possible, and it's the
same engineering discipline established on `gateway-probe` this session,
carried over rather than reinvented:

| gateway-probe pattern | iofus equivalent |
|---|---|
| Read-only by default; the one mutating tool is opt-in and auto-reverts | Studio changes are always reversible — every edit is a save, not a commit; undo and version-restore always exist |
| Every report is a structured, versioned, schema-validated document | Page JSON is versioned, validated, and portable — never opaque |
| Never a crash, never a silent wrong answer — honest, specific failure messages | Reader Mode is the honest fallback; a page can be chaotic, it can never trap or fail a visitor |
| Every claim needs a test that could fail — adversarial cases included | Injection attempts, malformed page JSON, oversized uploads get tested before ship, not assumed handled |
| "No customer support required" — foreseeable failure modes get handled up front | Same standard, applied here from Phase 1, not bolted on after launch |

## Safety rules

A profile can be loud, strange, or dense with personality. It cannot
become a website that runs code.

**Never in a profile:** JavaScript, arbitrary HTML, login forms, popups,
automatic redirects, third-party embeds/remote scripts, hidden
report/block controls, autoplay media (V1).

**Allowed in V1:** structured text, approved links, validated images,
validated audio file uploads, theme colors and approved fonts, background
styles, section ordering, badges/stamps/decorative assets.

Untrusted content is handled as data in the correct output context, never
inserted directly into HTML, script, CSS, or URLs (OWASP's XSS prevention
guidance is the relevant reference).

**Resolving one real tension up front:** "no third-party embeds" and
"Playlist page part" would contradict each other if Playlist meant
embedding a Spotify/YouTube player — that's exactly the remote-script
surface the rules above exist to close. So Playlist in V1 means
iofus-hosted audio file uploads (validated file type/size, no
executable content) or plain outbound links to an external service,
rendered the same as any other Link — never an embedded third-party
player. Revisit only if a specific, sandboxable, script-free embed format
is found later; don't quietly relax this for convenience.

## Reader Mode & Safe Preview

The two most important safety features:

- **Reader Mode** — any visitor gets clean, readable content, decoration
  stripped. A theme cannot hide, copy, or override this or the
  Reader/Block/Report bar at the top of every page.
- **Safe Preview** — the owner can hide draft theme changes without
  deleting them.

> A page can be chaotic. It cannot trap a visitor in chaos.

## Discovery

Four ways to find a page, none of them a ranked feed:

- **Wander** — recently redecorated pages, browse-by-feeling,
  browse-by-interest, random page.
- **Web rings** — curated topic/community chains, the old-web way.
- **Friend links** — browse outward from a page you already like: see
  their friends, see *their* friends. This is the MySpace-native
  discovery path, and it's graph-walking by the visitor's own choice, not
  an algorithm deciding what they see next.
- **Direct** — someone just tells you `@theirhandle`.

All curated and moderated, never algorithmically ranked. Public does not
automatically mean searchable, featured, or recommended; that separation
is what keeps moderation manageable at any size — including friend-graph
browsing, which respects each page's own visibility settings (a private
or unlisted friend doesn't show up in someone else's public graph walk).

## Moderation (V1)

**Visitors:** block, report, hide from discovery, Reader Mode, block
guestbook contact.

**Creators:** guestbook approval, private/unlisted/public, hide from
search, disable guestbook, panic mode (hide page from discovery quickly),
restore a previous version, export page data. Friend links require both
sides to accept — a request is never a public relationship until
approved — and a blocked account can't send one.

**Platform:** report review queue, rate limits, asset validation, a clear
community policy, moderator logs, appeals.

Federation, self-hosting, shared block lists, and remote-server trust
controls come later — only after the hosted product has real moderation
operations behind it. Do not decentralize at launch.

## Roadmap

### Phase 1 — Make a page *(complete)*

Account and handle · structured profile data · identity/links/now/friends
page parts · mutual-accept friend requests · six templates · public
profile URL · mobile renderer · Reader Mode · publish/unpublish · friend
request UI on profiles · settings inbox for incoming requests.

**Success test:** a first-time user publishes a readable page and sends
one friend link in under five minutes. ✓

### Phase 2 — Shape a page *(complete)*

Theme controls · template selection · colors/fonts/panels/density ·
page-part order · desktop/mobile preview · undo · save version · restore
version · gallery, blog, devlog, badges, and top 8 page parts · full
five-tab Studio.

**Success test:** test users make pages that visibly differ without
touching code. ✓

### Phase 3 — Keep it safe *(complete)*

Image descriptions · contrast warnings · reduced-motion support · Safe
Preview · export/import · hide from discovery · private/unlisted/public ·
block and report · friend-request blocking and mutual-accept enforcement ·
guestbook approval · rate limits · moderator queue · panic mode.

**Success test:** every public page stays readable and navigable through
Reader Mode, and a blocked account can't re-friend or re-contact. ✓

### Phase 4 — Wander *(complete)*

Recently decorated pages · tags · curated collections · random page · web
rings · friend-link graph browsing · guestbooks with approval · rate
limits · moderator queue.

**Success test:** visitors find interesting pages with no feed — by tag,
by ring, or by walking the friend graph — and creators can avoid
unwanted contact entirely. ✓

### Phase 5 — Rich modules and shared themes *(complete)*

Shrine, Playlist (outbound links — no autoplay embeds), Pixel Art, and
Mini-page modules · theme gallery · install and fork a theme ·
attribution · theme version history · theme reporting · module registry
pattern · scoped custom CSS.

**Success test:** someone builds a shrine or pixel-art piece, and someone
else reuses and remixes a theme, without losing creator credit or
accessibility guarantees. ✓

### Phase 6 — Ask Us *(planned, not yet built)*

The first capability built on the "Internet of Us" principle: a
structured, rate-limited, consent-gated way to reach people *outside*
your friend graph when you need help, knowledge, or perspective you
don't already have access to — grounded in the WeNet "Internet of Us"
research, not invented from scratch. Never a DM inbox, never an
algorithm — a member posts a need, optionally anonymous and
audience-narrowed for sensitive topics, routed to a small pool of
opted-in members within an existing tag or ring. Answering earns an
"earned" helper badge, distinct from decorative ones.

Concrete pieces (each reuses an existing pattern rather than inventing
one — see `docs/architecture.md` once this lands):
- Opt-in "reachability" setting + per-relationship contact-rate norm
  (reuses `rateLimit.ts` and the block-relationship pattern in
  `friends.ts`)
- Optional, self-attested "I can help with…" tags — separate from
  decorative page content, never used for matching without explicit
  opt-in, never inferred or scored
- Anonymous + audience-narrowed asks for sensitive topics (reuses the
  existing `private`/`unlisted`/`public` visibility model)
- Community-chosen matching dimensions: a ring or tag owner picks which
  optional profile fields matter for routing within it — off by default

Explicit guardrails carried over from the research, not left implicit:
diversity exposure never overrides safety; no profile dimension is ever
used for matching without the member's own opt-in; a member can always
see and revoke what's being used to match them; the per-relationship
rate limit is the mechanism that makes this safe to ship, not optional
polish; automatic translation is a named real need but also a named real
risk (mistranslation read as offense) and is explicitly out of scope
until there's a concrete plan for handling that failure gracefully.

**Success test:** someone gets a genuinely useful answer from a stranger
they'd never have met through their existing friend graph, without
anyone being contacted more than they consented to, and without a single
support ticket about unwanted contact.

## What V1 excludes

Infinite feed, DMs, arbitrary CSS/HTML, JavaScript in pages, third-party
embeds, autoplay music, plugin system, marketplace, AI-generated pages,
federation, self-hosting, recommendation algorithms, real-time
collaborative editing.

The product stays ambitious by making expressive personal publishing
simple, durable, safe, and accessible — not by shipping every possible
social or creator feature.

## Decisions

Two real product calls, surfaced now rather than guessed at, to be
decided when there's enough real signal — not before:

- **Visitor privacy — decided: none.** Creators do not get page views,
  referrers, or any visitor analytics. The product's anti-surveillance
  ethos is the reason; this is not revisited quietly later.
- **Sustainability — ongoing, not one-time.** A hosted platform with
  human moderation has real running costs. A funding path (subscription
  for extra storage/themes, donations, sponsorship) stays in view
  continuously and gets raised again once there's a real user base to
  point to — not before, and not solved today.

## Closing

iofus is a modern, safer MySpace: a personal-page platform where
creative ownership and imperfect personality come first. Pick a feeling,
fill your page with the artifacts that are actually yours — music,
badges, guestbook entries, shrines, pixel art, playlists, blogs, a shrine
to your favorite band — and publish a page you can keep changing. People
find each other through tags, web rings, wandering, and the friend links
that make this a real social graph, not a feed.

> Make your corner of the internet. Wander into someone else's.

---

## A note on the name

iofus is a rename of Webroom, and more than a cosmetic one. It's a play on
"Internet of Us" — named after research (the EU Horizon-2020 WeNet
project's diversity-aware social platform work) showing that people have
real, valuable diversity — skills, knowledge, culture, perspective —
sitting outside their existing network, and benefit when a system helps
them reach it safely, on their own terms, without turning into a feed or
an algorithm.

Webroom already delivered half of that: everyone gets a piece of the
internet that's actually theirs. The rename marks the start of building
the other half — a way to reach people beyond who you already know, when
you actually need to — without breaking any of the no-feed, no-DM,
no-algorithm rules this product has held from day one. See the roadmap
above for what ships first (`Ask Us`) and the ethical guardrails ported
directly from that research, not invented from scratch.

This repo (`zowskyy/iofus`) is now iofus's own dedicated home, separate
from `gateway-probe`, which stays in the `deno` repo where it started.
