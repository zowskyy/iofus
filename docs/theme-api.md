# Theme API

## CSS custom properties (always applied)

| Token | Source |
|-------|--------|
| `--page-accent` | `theme.accent` (validated hex) |
| `--page-bg` | `theme.background` |
| `--page-ink` | derived via `readableTextFor()` |
| `--page-ink-soft` | derived via `readableTextFor()` |
| `--page-bg-image` | `url("{theme.backgroundImageUrl}")` — only set when the field is non-empty; `globals.css` falls back to `none` |
| `--page-bg-repeat` | `repeat` when `theme.backgroundTile`, else `no-repeat` |
| `--page-bg-size` | `auto` when tiled, else `cover` |

Applied on `.page-body` via inline style — never raw user CSS in the global stylesheet. All of these are stripped entirely in Reader Mode.

## Marquee status line

`theme.marqueeStatus` (boolean) adds the `marquee` class to `.page-status` and wraps the status text in a `<span>` that scrolls via the `page-status-marquee` keyframe animation in `globals.css`. `.reduce-motion` (below) already forces `animation: none !important` on every `.page-body` descendant, so turning on Reduce Motion silently stops the marquee too — no separate override needed.

## Template attribute

`data-template="{template}"` on `.page-body` enables template-specific CSS in `globals.css` (soft-web, pixel-tavern, etc.).

## Density and font classes

- `.density-cozy | .density-comfortable | .density-spacious`
- `.font-serif | .font-sans | .font-mono`
- `.reduce-motion` when `theme.reduceMotion` is true

## Scoped custom CSS

When `theme.customCssEnabled` and not in Reader Mode:

1. CSS is parsed by `scopeProfileCss()` in `cssScope.ts`
2. Rules are prefixed with `.profile-scope--{handle}`
3. Rejected rules are shown in Studio Access tab — they are not applied

### Allowed

Common visual properties, `@media` including `prefers-reduced-motion`, scoped class selectors.

### Blocked

`@import`, `@font-face`, `javascript:` URLs, `expression()`, selectors targeting `html`, `body`, `.top-bar`, fixed overlays with z-index.

## Shared themes

Gallery at `/explore/themes`. Install copies tokens to your page with attribution. Fork creates a new gallery entry linked to the source.

Theme object stored in `shared_themes.theme_json` matches `PageDocument.theme`.
