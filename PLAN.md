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

Not social media with feeds, trends, short-form video, ads, and
engagement scores. Not a full website builder or code sandbox either.
Private messaging exists (Phase 7, see below) but it's a deliberate,
narrow exception, not the mainstream always-on DM inbox: real 1:1
threads you start on purpose, with the same block/rate-limit guardrails
as the rest of the platform.

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

## The screens

| Screen | Verb | Purpose |
|---|---|---|
| **Explore** | Wander | Discover pages by tag, web ring, random, and friend links |
| **Make** | Create | Start a page from a short guided flow |
| **My Page** | Publish | View and share your public space |
| **Studio** | Shape | Change appearance, content, and layout |
| **Ask Us** | Reach out | Post a need, get answered by people outside your friend graph (Phase 6) |
| **Messages** | Talk | Private 1:1 threads between two handles (Phase 7) |

No infinite feed, marketplace, trend screen, notification center,
creator-analytics dashboard, plugin screen, or federation controls in V1.
Friends are a graph you browse, not a feed you're fed. Messages are the
one screen that's a deliberate, narrow exception to "no DMs" — see
Phase 7 below for the guardrails that keep it safe.

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

### Phase 5.5 — Y2K/Tumblr-era expressiveness *(first slice shipped)*

A user test flagged that Studio didn't yet capture the maximalist,
decorate-your-corner spirit of 2003–2006 MySpace and Tumblr's heyday.
Schema version bumped to **4** (`migrateDocument()` upgrades v1–v3
losslessly). Shipped:

- `theme.backgroundImageUrl` + `theme.backgroundTile` — a tiled or
  full-bleed background image, exposed in Studio's Look tab.
- `theme.marqueeStatus` — scrolls the identity status line, CSS-only,
  and is silently disabled whenever Reduce Motion is on (same
  `.reduce-motion *` rule that already kills every other animation —
  no separate override needed, so it can't be forgotten later).

**Deliberately deferred**, not silently dropped — each is a bigger,
separately-scoped piece:
- **Avatar images**: `identity.avatarAssetId` has existed in the schema
  since an earlier phase but was never actually rendered on the page —
  found while researching this pass. Fixing it properly needs a real
  asset upload/serving system (nothing like that exists yet — today's
  gallery/shrine images are just URL fields), which is real
  infrastructure work, not a quick add.
- **Custom cursor picker**: wanted a small bundled set of built-in
  cursor styles (not arbitrary external URLs — hotlinking a stranger's
  cursor image is a privacy/tracking surface, not something to expose
  by default), which means shipping actual cursor image assets first.
- **Badge images**: badges are emoji + text only today; image/GIF
  badges (the classic 80×15 web-badge format) need the same
  URL-vs-upload decision as avatars.

Custom CSS (`theme.customCssEnabled`) already technically permits
hand-written cursor URLs, `@keyframes` animations, and
`::-webkit-scrollbar` styling — `cssScope.ts`'s denylist never blocked
these — but there's no UI pointing anyone at that, so it stays
expert-only until it has a real editor.

### Phase 6 — Ask Us *(shipped: data layer + UI)*

The first capability built on the "Internet of Us" principle: a
structured, rate-limited, consent-gated way to reach people *outside*
your friend graph when you need help, knowledge, or perspective you
don't already have access to — grounded in the WeNet "Internet of Us"
research, not invented from scratch. Never a DM inbox, never an
algorithm — a member posts an ask, and anyone in the matching pool
(never a specific person) can answer it.

**Built so far** — `app/src/lib/asks.ts`, fully tested
(`asks.test.ts`, adversarial-style, same standard as `friends.test.ts`):
- Opt-in "reachability" setting on the account, off by default
  (`setReachableForAsks`/`isReachableForAsks`) — no one is ever
  contactable by strangers without turning this on themselves.
- `createAsk`, rate-limited to 5/day per asker (reuses `rateLimit.ts`,
  parameterized to a day-long window instead of a new mechanism).
- `listAsksForViewer`: a non-sensitive ask is shown only to reachable,
  non-blocked members, optionally filtered by an asker-chosen `domain`
  string; a **sensitive** ask is shown only to the asker's own accepted
  friends — never the open pool, matching the paper's "restrict to a
  trusted pool of peers" safeguard exactly, not a diluted version of it.
  Blocked relationships are excluded in both directions regardless of
  reachability.
- `answerAsk`: rejects self-answers, duplicate answers from the same
  person, answers on a closed ask, and answers from anyone in a blocked
  relationship with the asker.
- Anonymous asks: `asker_id` is always stored (for moderation), but the
  asker's handle is only ever returned to the asker themselves — every
  other viewer sees `askerHandle: null`.

**UI shipped**: `/asks` (reachability toggle, compose form with domain/
anonymous/sensitive fields, the answerable pool) and `/asks/mine` (a
member's own asks and their answers), wired into `SiteNav.tsx`.

**Not yet built** (deliberately deferred, not silently dropped):
- "I can help with…" self-attested tags and community-chosen matching
  dimensions — `domain` today is a single plain string the asker
  types, not a structured, community-owned dimension set.
- Helper badges / recognition for answering.
- Per-relationship contact-rate norm (the paper's "don't ask the same
  person more than 3x/week") — not applicable yet since there's no
  1:1 follow-up mechanism; today's rate limit is per-asker daily
  volume only.

Guardrails already enforced in code, not just documented: diversity/
reach never overrides safety (sensitive → friends-only, no exception);
no profile dimension used without opt-in (`reachable_for_asks` defaults
off); the daily rate limit is real and tested, not aspirational.
Automatic translation remains out of scope, per the paper's own named
mistranslation risk.

**Success test:** someone gets a genuinely useful answer from a stranger
they'd never have met through their existing friend graph, without
anyone being contacted more than they consented to, and without a
single support ticket about unwanted contact.

### Phase 7 — Messages *(shipped: real 1:1 DMs, a deliberate reversal)*

Originally excluded on purpose ("no DMs, ever" — see the git history of
this section). Reversed on explicit product direction: real private
messaging between two handles, styled after old-school black-and-white
AIM windows (`app/src/app/globals.css`'s `.aim-*` classes) — a
deliberate exception to "product chrome, not decoration" everywhere
else on the platform.

This is **not** Ask Us's safety model reused — it's a different shape
of risk (a specific person contacting a specific person, not a public
opt-in pool) with its own guardrails, built in `app/src/lib/messages.ts`
and fully tested (`messages.test.ts`, 23 cases):
- A block relationship in either direction always wins, checked at
  every `sendMessage()` call — never assumed safe just because a thread
  already exists.
- Starting a conversation with someone **new** is rate-limited to 10/day
  per sender (same `checkRateLimit` + `DAY_MS` mechanism Ask Us uses).
  Messages within an *existing* thread are not separately capped — a
  real back-and-forth isn't stranger contact.
- No read receipts are exposed to the other person. `read_at` is
  recorded only so the viewer's *own* unread count is accurate
  (surfaced as a nav badge, same pattern as the Settings pending-count
  badge) — never shown to the sender.
- A non-participant can't read or mark a thread read
  (`ConversationAccessError`), even if they know the conversation id.
- Messaging is reachable from a profile page's controls bar (a "Message"
  link, next to Report/Block) and from `/messages` (the buddy list) —
  never a default-open inbox pushed at anyone.

**Not yet built**: presence/"away message" simulation, message editing
or deletion, group threads. All deliberately out of scope for this
pass, not silently dropped.

## What V1 excludes

Infinite feed, arbitrary CSS/HTML, JavaScript in pages, third-party
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
