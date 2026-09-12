import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "on",
};

export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // Nonce plus strict-dynamic rather than 'unsafe-inline'. This is the
    // directive that actually matters here: the whole product is user-authored
    // content, and 'unsafe-inline' would let any injected <script> run. Next
    // reads the nonce out of this header and applies it to its own framework
    // and page bundles automatically. 'unsafe-eval' is only needed in dev,
    // where React uses eval to rebuild server stack traces.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // style-src deliberately keeps 'unsafe-inline'. Roughly 230 components set
    // a style attribute, and per-page theming (colors, backgrounds, density)
    // is emitted as inline custom properties -- it is the product, not an
    // oversight. Inline styles are also a far weaker vector than inline
    // scripts, and cssScope.ts sanitizes the user-authored CSS separately.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // Remote https images stay allowed because gallery, shrine and background
    // images are validated user-supplied URLs -- a shipped feature since
    // Phase 5. Narrowing this to 'self' would silently break existing pages.
    // The privacy cost (a remote host sees visitor IPs) is real and is why an
    // image proxy is the right long-term answer, but removing the feature to
    // close it is not a trade this pass gets to make.
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  // Must be unpredictable and unique per request, or an attacker able to guess
  // it could mark their own injected script as trusted.
  const nonce = crypto.randomUUID();
  const csp = buildCsp(nonce, isDev);

  // Next extracts the nonce from the request-side CSP header during rendering
  // and stamps it onto the scripts it emits, so it has to be visible on the
  // request, not just the response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  response.headers.set("Content-Security-Policy", csp);

  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts|favicon\\.ico|manifest\\.json|sw\\.js|icons).*)"],
};
