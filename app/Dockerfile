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
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
