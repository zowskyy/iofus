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
      allowedOrigins: [
        // Development-only. Leaving localhost trusted in production widens the
        // Server Action origin check beyond the real deploy host.
        ...(process.env.NODE_ENV === "development" ? ["localhost:3000", "*.trycloudflare.com"] : []),
        ...(process.env.IOFUS_ALLOWED_ORIGIN ? [process.env.IOFUS_ALLOWED_ORIGIN] : []),
      ],
    },
  },
};

export default nextConfig;
