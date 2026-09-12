
## gstack

All web browsing must use the `/browse` skill from gstack. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
`/office-hours` `/plan-ceo-review` `/plan-eng-review` `/plan-design-review` `/design-consultation` `/design-shotgun` `/design-html` `/review` `/ship` `/land-and-deploy` `/canary` `/benchmark` `/browse` `/connect-chrome` `/qa` `/qa-only` `/design-review` `/setup-browser-cookies` `/setup-deploy` `/setup-gbrain` `/retro` `/investigate` `/document-release` `/document-generate` `/codex` `/cso` `/autoplan` `/plan-devex-review` `/devex-review` `/careful` `/freeze` `/guard` `/unfreeze` `/gstack-upgrade` `/learn` `/context-save` `/context-restore` `/spec`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

---

## Non-negotiable coding mandates

These rules apply to every project, every session, without exception. They exist because I introduced real production bugs by violating them. Each rule is tied to a specific failure.

### 1. Read the full file before adding anything to it

**ALWAYS read the entire file before writing a new function, constant, or export into it.**

Scan for: existing constants that must be satisfied (SQL fragments, alias requirements, type contracts), patterns all other functions follow, invariants stated in comments. A new function must conform to all of them.

*Failure this prevents:* I added `countPublicProfiles()` to `discovery.ts` without noticing the file's `DISCOVERABLE_WHERE` constant references alias `u`, requiring a `JOIN users u`. Every other function had this JOIN. Mine didn't. CI broke.

### 2. Never use training-data assumptions for framework APIs — check the installed version

**ALWAYS check the actual installed package version and its docs before using any framework API.**

The repo's AGENTS.md, package.json, and `node_modules/[pkg]/dist/docs/` are authoritative. Training data is a stale approximation — framework APIs change across major versions and my training data will be wrong about them.

*Failures this prevents:*
- I used the Next.js 15 `priority` prop on `<Image>` when Next.js 16 replaced it with `preload`.
- I used `retry` as the error boundary prop name when Next.js 16 uses `reset`. Both would have caused runtime failures.

### 3. Never load unbounded rows into memory — LIMIT at the DB layer

**Every SQL SELECT that can return more than one row MUST have a LIMIT clause unless it is a COUNT or aggregate.**

Never load all rows then slice in JavaScript. The DB must enforce the bound. Default safe limits: lists shown in UI ≤ 500, nav counts ≤ 200, admin bulk exports require explicit pagination.

*Failure this prevents:* I initially loaded all public profiles into memory and sliced with `.slice(0, 49998)` in application code. This creates an unbounded query that scales with the user base.

### 4. Run typecheck before every commit — a commit that does not pass typecheck does not ship

**ALWAYS run `npx tsc --noEmit` (or the project's equivalent) and confirm zero errors before staging a commit.**

A type error is a bug. Catching it before commit is free. Catching it after CI fails costs a cycle and breaks trust.

*Failure this prevents:* Wrong prop names on React/Next.js components (`retry` vs `reset`) would have been caught immediately by the TypeScript compiler.

### 5. Reason about build-time vs runtime for every new file in a framework routing layer

**Before creating a metadata route, API route, or any file that Next.js (or another framework) may statically evaluate at build time, explicitly decide: does this need runtime data? If yes, add the appropriate directive (`export const dynamic = "force-dynamic"`, etc.) and explain why.**

*Failure this prevents:* I initially omitted `export const dynamic = "force-dynamic"` from `sitemap.ts`. The sitemap queries a live SQLite volume not mounted during `next build`, so it would have produced an empty sitemap in production.

### 6. Be proactive, not reactive — find real problems before tools flag them

**Before declaring any change done, adversarially review the scope of what you touched:**
- What invariants does this code assume?
- What related code was NOT touched that has the same shape of problem?
- What would a security auditor look for in this exact file?

Do not treat a passing bot review as a proxy for correctness. Bot reviews are a floor, not a ceiling.

*Failure this prevents:* I was patching findings from CodeRabbit and the audit agent rather than reading the actual code and finding the real issues. Real bugs (unbounded queries, missing rate limits, error message leaks) went unnoticed until a dedicated audit surfaced them.
