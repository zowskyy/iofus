# TODOS

Deferred work, captured with context so it isn't silently lost.

## Add structured logging to new error-rescue points

**What:** Add `console.error`/log lines at the 3 new rescue points introduced by the current hardening pass: `reviewAppeal`'s authz rejection (`appeals.ts`), `deleteRingAction`'s caught non-`WebRingError` (`rings/[slug]/manage/actions.ts`), and `exportPageAsHtml`'s new `ExportError` (`exportPage.ts`).

**Why:** These paths become user-visible and typed as part of this pass, but nothing writes a server-side log line at the moment of failure. A pattern of repeated non-moderator authz attempts against `reviewAppeal`, or recurring export failures, would only be discoverable by grepping the DB directly — no signal surfaces on its own.

**Pros:** Cheap (one line per rescue point). Makes abuse patterns and recurring failures discoverable without DB archaeology. Matches the project's "observability not optional" standard for new codepaths.

**Cons:** None blocking. Low urgency — these are new, currently low-frequency paths, and the project has no centralized logging/observability sink yet (confirmed: no logger import anywhere in `app/src/lib/`), so a handful of scattered `console.error` calls is a starting point, not a full solution.

**Context:** Surfaced during `/plan-eng-review` of PR1 (appeals authz fix), PR2a/2b (ring action fixes), and PR3 (test coverage pass). Revisit once there's an actual log sink (e.g. if the project ever adds a hosted logging provider) — at that point this TODO should expand to "wire existing rescue points into the new sink," not just "add console.error."

**Depends on:** PR1, PR2a, and PR3 landing first (the rescue points this TODO targets don't exist until then).

**Priority:** P3
