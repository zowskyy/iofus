# PROJECT_TRACKING — iofus reliability & hardening

## Purpose

iofus (`app/`) is a Next.js 16 personal-webspace platform — MySpace-style pages, radical customization, no feed/algorithm/DMs-by-default. This file tracks three completed hardening passes on top of the existing product (audit → repair, visual/accessibility/property/performance, network/persistence/crash reliability) — not the product itself, which PLAN.md and the `docs/` tree already cover. Kept here because the work spans dozens of files across `src/lib`, `src/app`, `src/components`, and three separate test suites (`src/**/*.test.ts`, `tests/e2e/`, `tests/concurrency/`), and because the standing instruction for a session this size is an honest, current file inventory rather than trusting memory across future sessions.

## Current State

**Pass 1 — audit & repair.** Baseline was already clean (TS/lint/build). Found and fixed: a CSS-selector-blocklist regex bug (`\b\.top-bar\b` never matches — `.` is a non-word char) that let a hostile theme's CSS reach the safety bar; removed a product-identity violation (`VisitorCounter`/`PresenceIndicator` contradicted PLAN.md's explicit "no visitor analytics, not revisited quietly later"). Added the first E2E suite (`tests/e2e/core-journey.spec.ts`).

**Pass 2 — visual/accessibility/property/performance.** Added `tests/e2e/visual-regression.spec.ts` (14 baselines), `tests/e2e/accessibility.spec.ts` (axe scans + keyboard journey), 5 property-test files, `tests/e2e/performance-stress.spec.ts`. Found and fixed: a second instance of the same selector-regex bug (`:root`, found by the new property fuzzer, not by hand); three built-in theme presets and three seeded shared-gallery themes failing the platform's own 4.5:1 contrast bar; removed dead code (`ensureSeedSharedThemes()`, a second unreachable copy of the real seed logic in `db.ts`).

**Pass 3 — network/persistence/crash reliability.** Added `tests/e2e/network-resilience.spec.ts`, `tests/concurrency/` (real multi-process SQLite contention + a real SIGKILL-mid-transaction test). Found and fixed: no `busy_timeout` configured (real cross-process contention produced immediate "database is locked"); `getDb()` cached a permanently-broken connection on migration failure; `seedWebRings`/`seedCollections`/`seedSharedThemes` had a real check-then-insert race under concurrent first boot; **no error boundaries existed anywhere in the app** (`src/app/error.tsx` added) and Studio's `runAction`/`handleExport`/`handleImport` had no network-failure handling; extended the fix to all 13 `useActionState` forms via one shared wrapper (`src/lib/actionResilience.ts`).

**Follow-up hardening (4 items explicitly requested).** Real SIGKILL crash recovery (`tests/concurrency/crash-recovery.test.ts`) — verified WAL recovery, schema integrity, and clean restart, not assumed from documentation. 200%-text-zoom accessibility tests found and fixed a real nav-bar overflow (`.top-bar .controls` lacked `flex-wrap` outside a pixel-based mobile breakpoint). All 13 forms' network handling verified against real request interception. `LayoutTab.tsx`'s inline reorder/toggle logic extracted to `src/lib/pagePartsOrdering.ts` so it's property-testable — the resulting fuzzer immediately found a wrong assumption in my own test (toggle isn't a true inverse; re-adding always appends at the end).

## File Inventory

### New/modified production code this work (`app/src/`)

| File | Status | Note |
|---|---|---|
| `lib/db.ts` | modified | `busy_timeout`, wedged-connection fix, seed-race transaction, all backed by real multi-process tests |
| `lib/cssScope.ts` | modified | `.top-bar`/`:root` selector-bypass fixes |
| `lib/pageDocumentTheme.ts` | modified | contrast-fixed accent colors on 3 presets |
| `lib/creativeSparks.ts`, `lib/sharedThemes.ts` | modified | contrast fixes propagated to mood-picker swatches, "Surprise me" palette, seeded gallery themes; dead `ensureSeedSharedThemes()` removed |
| `lib/actionResilience.ts` | complete | generic `useActionState` network-error wrapper, unit-tested |
| `lib/pagePartsOrdering.ts` | complete | extracted, property-tested `movePagePart`/`togglePagePart` |
| `app/error.tsx` | complete | root error boundary (previously none existed anywhere) |
| `app/nav.css` | modified | `.top-bar .controls` gets `flex-wrap` outside the mobile breakpoint (200%-zoom overflow fix) |
| `components/studio/StudioClient.tsx` | modified | `runAction`/`handleExport`/`handleImport` catch network failures |
| `components/studio/LayoutTab.tsx` | modified | calls the extracted ordering functions instead of inline duplicates |
| 13 form components (signup, login, make, appeal, ask/answer, publish-theme, theme-report, thread-composer, create-ring, manage-ring, guestbook-sign, report) | modified | wrapped in `withNetworkErrorHandling` |
| `components/VisitorCounter.tsx`, `components/PresenceIndicator.tsx` | **removed** | contradicted PLAN.md's "no visitor analytics" decision |

### Test suites added

| Suite | Location | Count | Run via |
|---|---|---|---|
| Unit + property | `src/**/*.test.ts` | 276 tests, 25 files | `npm test` |
| Functional/a11y/network/perf E2E | `tests/e2e/{core-journey,accessibility,network-resilience,performance-stress}.spec.ts` | 21 tests | `npm run test:e2e` |
| Visual regression | `tests/e2e/visual-regression.spec.ts` | 14 baselines | `npm run test:e2e:visual` (own isolated DB — see comment in `playwright.config.ts` for why) |
| Multi-process concurrency + crash recovery | `tests/concurrency/` | 5 tests | `npm run test:concurrency` |

## Open Dependencies

- `tests/concurrency/*.ts` run via `tsx` (added as a devDependency) because Node's native TS-stripping doesn't resolve extension-less relative imports the way the app's own TS config does — this is test-only tooling, not a production dependency change.
- `scripts/run-visual-e2e.mjs` exists solely to set `PW_SUITE=visual` cross-platform (POSIX inline env-var syntax breaks on Windows cmd.exe/PowerShell) without adding `cross-env`.

## Known Gaps (honest — not silently dropped)

**Security/correctness, never read line-by-line the way auth/friends/cssScope/pageDocument were:** `asks.ts`, `messages.ts`, `webRings.ts`, `proximityGraph.ts`, `appeals.ts`. Given two real selector-regex bugs were only found by actually reading code, an unread file is a real unknown.

**Zero test coverage:** `notifications.ts`, `activityFeed.ts`, `exportPage.ts`, `collections.ts`, `stamps.ts`.

**3 ring-management actions bypass the network-resilience work**: `reviewRequestAction`/`removeMemberAction`/`deleteRingAction` in `ManageRingControls.tsx` are plain `<form action={bind(...)}>`, not `useActionState` — a network failure there falls back to the root error boundary (safe, no crash) rather than an inline recoverable error like the other 13 forms.

**Mobile:** no real-device or throttled-network testing (everything is Chromium desktop emulating a viewport); gallery/shrine `<img>` tags have no lazy-loading/`srcset`/`next/image`; no iOS Safari-specific testing; Studio's touch-editing ergonomics (not just no-overflow) never exercised end-to-end.

**Performance:** only `/`, `/explore`, `/signup` have navigation-timing numbers. No Lighthouse/Core Web Vitals, no bundle-size analysis, no N+1 audit beyond incidental findings.

**E2E coverage gaps:** no browser-level journeys for Ask Us, Messages, web rings, theme gallery install/fork, moderation queue, or appeals (friend-request/accept/block flows are covered at the persistence layer via `tests/concurrency/`, not at the browser level for these specific features).

**Visual regression:** 14 curated baselines, not exhaustive — no coverage of tag/collection/ring pages, moderation UI, settings, messages, or asks screens.

**Docs:** top-level `README.md` still doesn't reflect the Messages/Ask Us phases the way `PLAN.md` does (pre-existing staleness, flagged, not fixed).

**Process:** not a git repository yet — nothing from any of these three passes is committed. No CI config exists; `test:e2e`/`test:concurrency`/`test:e2e:visual` only run because they're run by hand.

## Verification (last full run, this session)

- Typecheck: clean. Lint: 0 errors, 5 pre-existing warnings.
- Unit: 276/276 (25 files).
- E2E (functional/a11y/network/perf): 21/21, run twice.
- Visual regression: 14/14, run three times against fresh databases.
- Multi-process concurrency: 4/4, 18+ consecutive clean runs across the session.
- Crash recovery (real SIGKILL): 1/1, 5 consecutive clean runs.
- Production build: clean. Production smoke test (scratch DB): `/`, `/explore`, `/signup`, `/policy` → 200; `/@nobody` → 404.
