// Scoped custom CSS for profile pages. Rejects unsafe constructs per the
// Personal Webspaces safety policy — CSS alone is not a complete security
// boundary, but these rules close the obvious escape hatches.

const BLOCKED_PATTERNS: RegExp[] = [
  /@import\b/i,
  /@font-face\b/i,
  /@namespace\b/i,
  /javascript:/i,
  /expression\s*\(/i,
  /-moz-binding/i,
  /behavior\s*:/i,
  /url\s*\(\s*["']?\s*javascript:/i,
  /url\s*\(\s*["']?\s*data:/i,
  /<\s*\/?\s*style/i,
  /!\s*important/i,
];

/** Block a property value from a rule body regardless of which of its rules it appears in. */
function blockedBodyPattern(body: string): string | null {
  // Fixed/absolute/sticky positioning and transforms can cover the nav bar
  // or other page content regardless of z-index, and the check can't be
  // scoped to "harmless" values without a full CSS value parser, so both
  // properties are blocked outright rather than allow-listed.
  if (/position\s*:\s*(fixed|absolute|sticky)/i.test(body)) {
    return "Custom CSS may not use fixed, absolute, or sticky positioning.";
  }
  if (/\btransform\s*:/i.test(body)) {
    return "Custom CSS may not use the transform property.";
  }
  return null;
}

// `\b` only fires between a word char and a non-word char. `.`, `#`, and
// `:` are all non-word characters, so `\b\.top-bar\b` / `\b:root\b` never
// match unless the punctuation is itself preceded by a word character
// (e.g. "div.top-bar") — the far more common forms a selector actually
// takes (a bare leading token, or one preceded by whitespace/a combinator
// like "~ :root") sit at a non-word/non-word boundary and silently slip
// through. A property-based test caught `:root` making the same mistake
// `.top-bar` originally did — every selector that starts with punctuation
// belongs in this list, not the `\b`-bounded one. Bare-word tag names
// (html, body, iframe, dialog, script) are real identifiers where `\b` is
// correct.
const BLOCKED_KEYWORD_SELECTORS = /\b(html|body|iframe|dialog|script)\b/i;
const BLOCKED_SELECTOR_SUBSTRINGS = [".top-bar", ".studio-", "#studio", ":root"];

function isBlockedSelector(selector: string): boolean {
  if (BLOCKED_KEYWORD_SELECTORS.test(selector)) return true;
  const lower = selector.toLowerCase();
  return BLOCKED_SELECTOR_SUBSTRINGS.some((s) => lower.includes(s));
}

const MAX_CSS_LENGTH = 8000;
const MAX_RULE_COUNT = 80;

export interface CssScopeResult {
  css: string;
  warnings: string[];
  rejected: string[];
}

export function scopeProfileCss(raw: string, scopeClass: string): CssScopeResult {
  const warnings: string[] = [];
  const rejected: string[] = [];

  if (!raw.trim()) return { css: "", warnings, rejected };

  if (raw.includes("<")) {
    rejected.push("HTML tags are not allowed in custom CSS.");
    return { css: "", warnings, rejected };
  }

  if (raw.length > MAX_CSS_LENGTH) {
    rejected.push(`Custom CSS exceeds ${MAX_CSS_LENGTH} characters.`);
    return { css: "", warnings, rejected };
  }

  // Strip comments before any pattern matching or rule splitting — browsers
  // ignore /* ... */ anywhere in a stylesheet, so a token split across a
  // comment (e.g. "ht/**/ml") would otherwise dodge every regex below while
  // still applying at render time.
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, " ");

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(withoutComments)) {
      rejected.push(`Blocked pattern: ${pattern.source}`);
    }
  }

  if (rejected.length > 0) return { css: "", warnings, rejected };

  const rules = splitCssRules(withoutComments);
  if (rules.length > MAX_RULE_COUNT) {
    rejected.push(`Too many rules (${rules.length}); maximum is ${MAX_RULE_COUNT}.`);
    return { css: "", warnings, rejected };
  }

  const scoped: string[] = [];
  for (const rule of rules) {
    const trimmed = rule.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("@media")) {
      const mediaMatch = trimmed.match(/^(@media[^{]+)\{([\s\S]*)\}$/);
      if (!mediaMatch) {
        warnings.push("Skipped malformed @media rule.");
        continue;
      }
      const inner = scopeSelectors(mediaMatch[2]!, scopeClass, rejected);
      if (inner) scoped.push(`${mediaMatch[1]}{${inner}}`);
      continue;
    }

    const ruleMatch = trimmed.match(/^([^{]+)\{([^}]*)\}$/);
    if (!ruleMatch) {
      warnings.push(`Skipped malformed rule: ${trimmed.slice(0, 40)}…`);
      continue;
    }

    const selector = ruleMatch[1]!.trim();
    const body = ruleMatch[2]!.trim();

    if (isBlockedSelector(selector)) {
      rejected.push(`Blocked selector: ${selector}`);
      continue;
    }

    const blocked = blockedBodyPattern(body);
    if (blocked) {
      rejected.push(blocked);
      continue;
    }

    const scopedSelector = selector
      .split(",")
      .map((s) => {
        const part = s.trim();
        if (!part) return "";
        if (part.startsWith(scopeClass)) return part;
        return `${scopeClass} ${part}`;
      })
      .filter(Boolean)
      .join(", ");

    scoped.push(`${scopedSelector} { ${body} }`);
  }

  if (rejected.length > 0) return { css: "", warnings, rejected };

  return { css: scoped.join("\n"), warnings, rejected };
}

/** Validate and scope custom CSS for a profile. Fails closed when any rule is rejected. */
export function validateProfileCustomCss(
  raw: string,
  handle: string,
): { ok: true; css: string; warnings: string[] } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, css: "", warnings: [] };
  const scopeClass = `.${profileScopeClass(handle)}`;
  const result = scopeProfileCss(raw, scopeClass);
  if (result.rejected.length > 0) {
    return { ok: false, error: result.rejected.join("; ") };
  }
  return { ok: true, css: result.css, warnings: result.warnings };
}

function scopeSelectors(block: string, scopeClass: string, rejected: string[]): string {
  const rules = splitCssRules(block);
  const out: string[] = [];
  for (const rule of rules) {
    const ruleMatch = rule.trim().match(/^([^{]+)\{([^}]*)\}$/);
    if (!ruleMatch) continue;
    const selector = ruleMatch[1]!.trim();
    if (isBlockedSelector(selector)) {
      rejected.push(`Blocked selector: ${selector}`);
      continue;
    }
    const body = ruleMatch[2]!.trim();
    const blocked = blockedBodyPattern(body);
    if (blocked) {
      rejected.push(blocked);
      continue;
    }
    const scopedSelector = selector
      .split(",")
      .map((s) => `${scopeClass} ${s.trim()}`)
      .join(", ");
    out.push(`${scopedSelector} { ${body} }`);
  }
  return out.join("\n");
}

function splitCssRules(css: string): string[] {
  const rules: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        rules.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  const tail = css.slice(start).trim();
  if (tail) rules.push(tail);
  return rules;
}

export function profileScopeClass(handle: string): string {
  const safe = handle.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `profile-scope--${safe}`;
}
