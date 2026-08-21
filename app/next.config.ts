import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller, self-contained production build for container deployment
  // (see app/Dockerfile) — bundles only the files the server actually
  // needs into .next/standalone instead of shipping full node_modules.
  output: "standalone",
  serverExternalPackages: ["node:sqlite"],
  // Cloudflare Tunnel and other dev proxies serve the app
  // through a forwarded https:// URL rather than localhost. Next.js
  // Server Actions reject requests whose Origin doesn't match the host
  // it's running on unless that origin is explicitly allowed here.
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.trycloudflare.com"],
    },
  },
};

export default nextConfig;
