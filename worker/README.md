# Pivot Desk updater proxy (Cloudflare Worker)

A 100-line reverse proxy that fronts the GitHub release artifacts so the
in-app updater stops failing on CN networks.

## Why this exists

GitHub `releases/download/...` 302-redirects to
`release-assets.githubusercontent.com` (Azure Blob Storage). On Chinese
networks that Azure CDN domain is frequently unreachable even when
`github.com` itself responds, so the Tauri updater fails at the download
step with `error sending request for url`.

This Worker proxies both `latest.json` and the artifact downloads through
Cloudflare's edge. Worker → GitHub stays inside the Cloudflare network
(always works); client → Worker rides Cloudflare's Asia-Pacific edges,
which CN networks reach far more reliably than the Azure CDN.

## What it does

- `GET /latest.json` — fetches GitHub's `latest.json`, rewrites every
  platform URL from `github.com/.../releases/download/<tag>/<file>` to
  `<this-worker>/<tag>/<file>`, returns the result. 60s edge cache.
- `GET /<tag>/<filename>` — reverse-proxies the matching release asset
  from `github.com/.../releases/download/<tag>/<filename>`. 24h edge cache
  (release assets are immutable).
- Anything else → 404.

The minisign signature in `latest.json` is preserved as-is — it signs file
content, not the URL — so app-side verification is unaffected. Worker
compromise still cannot push a malicious update.

## Cost

Cloudflare Workers free tier:
- 100,000 requests/day (this app generates < 1,000/month even with a
  thousand users — orders of magnitude inside free)
- No egress billing
- Streaming responses, no size limit

You will not pay anything.

## Deploy

```bash
# from this directory (scaffold/worker/)
npm install -g wrangler
wrangler login                       # opens browser → Cloudflare OAuth
wrangler deploy
```

After the first deploy wrangler prints the live URL, e.g.:

```
Published pivot-desk-updater
  https://pivot-desk-updater.your-subdomain.workers.dev
```

Copy that hostname.

## Wire it up

Open `scaffold/src-tauri/tauri.conf.json` and replace `SUBDOMAIN` in the
first endpoint with the subdomain from above:

```json
"endpoints": [
  "https://pivot-desk-updater.your-subdomain.workers.dev/latest.json",
  "https://github.com/zgjsyxwj/gs-app/releases/latest/download/latest.json"
]
```

The second URL stays as a fallback — if the Worker is ever down, Tauri's
updater tries endpoint #2 automatically and the app still updates (slowly,
via the direct GitHub path).

Commit, tag, push. From the next release onward all users who upgrade
through that build will route through the Worker.

## Verify

After deploy, hit both routes and confirm:

```bash
# latest.json: URLs should point at *.workers.dev, not github.com
curl -s https://pivot-desk-updater.your-subdomain.workers.dev/latest.json | jq

# artifact: should 200 with the tarball bytes
curl -sI https://pivot-desk-updater.your-subdomain.workers.dev/v0.2.5/Pivot.Desk_aarch64.app.tar.gz
```

## Updating the Worker

Edit `worker.js`, then `wrangler deploy` again. Deploys are instant and
zero-downtime.

To roll back: `wrangler rollback` (lists previous versions).

To tear down completely: `wrangler delete pivot-desk-updater`. After that
the in-app updater will fall back to endpoint #2 (direct GitHub) — users
on slow networks will be back to the original failure mode but the app
will not break.
