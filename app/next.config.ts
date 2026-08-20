import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  // Codespaces (and other dev proxies) serve the app through a forwarded
  // https://*.app.github.dev URL rather than localhost. Next.js Server
  // Actions reject requests whose Origin doesn't match the host it's
  // running on unless that origin is explicitly allowed here — this is
  // a dev-time trust setting, not a production security hole, since it
  // only affects `next dev`.
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.app.github.dev"],
    },
  },
};

export default nextConfig;
