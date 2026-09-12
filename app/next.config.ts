import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller, self-contained production build for container deployment
  // (see app/Dockerfile) — bundles only the files the server actually
  // needs into .next/standalone instead of shipping full node_modules.
  output: "standalone",
  // Without this, Next infers the workspace root from the nearest lockfile and
  // finds the repository root (which has its own package-lock.json), emitting
  // .next/standalone/app/server.js instead of .next/standalone/server.js. The
  // Dockerfile copies the directory contents and runs `node server.js`, so the
  // inferred layout put the entry point somewhere the container never looked.
  // Pinning the root keeps the local build and the image identical.
  outputFileTracingRoot: import.meta.dirname,
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
