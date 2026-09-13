# Deploying to Render

`render.yaml` at the repo root is a Render Blueprint — it defines the web
service, the persistent disk, and every environment variable the app's own
boot gate (`validateProductionConfig`, see `app/src/lib/productionConfig.ts`)
requires. Values marked `sync: false` are secrets Render will prompt for
once and store, never committed to the repo.

## First deploy

1. In the Render dashboard: **New +** → **Blueprint**, connect this GitHub
   repository, and select the branch to deploy.
2. Render reads `render.yaml` and shows the service (`iofus`), its disk
   (`iofus-data`, 1GB mounted at `/data`), and the env vars it will set
   automatically. You'll be prompted for the `sync: false` ones — Render
   lets you leave these blank at blueprint-apply time and fill them in
   afterward from the service's Environment tab, which you'll need to do
   for `IOFUS_ALLOWED_ORIGIN` regardless (see step 4):
   - `IOFUS_SMTP_HOST`, `IOFUS_SMTP_USER`, `IOFUS_SMTP_PASS`, `IOFUS_SMTP_FROM`
     — real SMTP credentials. Without these, password-reset and
     email-change messages fail to send (the boot gate refuses to start
     without `IOFUS_SMTP_HOST`, on purpose — see the comment in
     `productionConfig.ts`).
   - `IOFUS_MODERATOR_HANDLE` — the handle of the account you want to be
     able to moderate reports/appeals. It only takes effect once an
     account with that handle actually exists (see `ensureModeratorSeed`
     in `app/src/lib/moderation.ts`) — sign up with this handle after the
     first deploy, or set it in advance for a handle you plan to claim.
   - `IOFUS_ALLOWED_ORIGIN` — leave blank for now; you don't know the
     service's public hostname until after the first deploy. See step 4.
3. Click **Apply** / **Deploy Blueprint**. Render builds `app/Dockerfile`
   and boots the container. **This first boot will fail its health check
   and the app will refuse to start** — `IOFUS_ALLOWED_ORIGIN` isn't set
   yet, and the boot gate treats that as fatal on purpose (see
   `productionConfigProblems` in `productionConfig.ts`). That's expected;
   continue to step 4.

4. Once the service exists, find its public hostname in the Render
   dashboard (shown at the top of the service page, e.g.
   `iofus-xxxx.onrender.com` — or Render's auto-injected
   `RENDER_EXTERNAL_HOSTNAME` value, visible under the service's
   Environment tab). Set `IOFUS_ALLOWED_ORIGIN` to that host (a bare host
   is treated as `https://` by the app's own origin validation — see
   `canonicalOrigin.ts`) or to your custom domain if you've attached one.
   Render redeploys automatically when you save the env var change.

## After the first deploy: verify the trusted-proxy hop count

`render.yaml` sets `IOFUS_TRUSTED_PROXY_HOPS=1`, which is correct for
Render's standard setup (Render terminates TLS and adds exactly one hop to
`X-Forwarded-For` before your container sees the request). Don't just trust
that default — confirm it against the running deployment:

```
curl https://<your-service>.onrender.com/api/_diag/ip
```

This diagnostic route (`app/src/app/api/_diag/ip/route.ts`) reports what
the app resolves as the real client IP given the configured hop count.
Compare it against your own actual IP; if they don't match, adjust
`IOFUS_TRUSTED_PROXY_HOPS` in the Render dashboard. Getting this wrong
means every anonymous visitor shares one rate-limit bucket, or the limit
can be bypassed by spoofing `X-Forwarded-For`.

## Data persistence

`IOFUS_DB_PATH=/data/iofus.db` points at the mounted disk, not the
container's ephemeral layer — this is required for signups, pages, and
messages to survive a redeploy. If you ever need a deliberately
throwaway/preview deploy without persistence, set
`IOFUS_ACK_EPHEMERAL_DB=true`; otherwise the boot gate refuses to start
(see `productionConfigProblems` in `productionConfig.ts`).

## Sanity checks after deploy

- `GET /api/health` — should return `{"status":"ok"}`. Render's own health
  check (`healthCheckPath` in `render.yaml`) already polls this.
- Sign up, verify email delivery actually arrives (tests SMTP config end to
  end, not just that the boot gate accepted it).
- Sign up with the handle in `IOFUS_MODERATOR_HANDLE`, then confirm
  `/moderation` is reachable from that account.
