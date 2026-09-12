# Multi-stage build for a small, self-contained production image.
# Needs Node 22.5+ for node:sqlite (same requirement as local dev).

FROM node:22.13-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Standalone runtime image — only the files next.config.ts's
# `output: "standalone"` actually needs, not the full node_modules tree.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -qq && apt-get install -y --no-install-recommends sqlite3 && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Persistent database directory. Mount a volume here in your hosting
# platform (Railway/Fly/Render all support this) so signups, pages,
# and friend data survive restarts and redeploys — SQLite is a single
# file, not a managed database, so without a real volume mounted at
# this path, every redeploy silently starts everyone over from zero.
RUN mkdir -p /data && chown nextjs:nodejs /data
ENV IOFUS_DB_PATH=/data/iofus.db

USER nextjs

EXPOSE 3000
# Render injects its own PORT at runtime, which overrides this; the default
# only matters when the image is run directly. HOSTNAME must stay 0.0.0.0 --
# binding loopback makes the service unreachable from outside the container.
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Checks the database is actually reachable, not merely that the port is open.
# The boot gate exits on bad configuration, but a container can also reach a
# state where it listens while being unable to serve.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
