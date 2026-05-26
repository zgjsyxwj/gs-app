// Cloudflare Worker — Pivot Desk updater proxy.
//
// Solves: GitHub release artifacts live on release-assets.githubusercontent.com
// (Azure Blob Storage), which is frequently unreachable on CN networks even
// when github.com itself responds. Routing through Cloudflare's edge swaps
// that path for a Worker → GitHub link that stays inside the Cloudflare
// network, and serves clients from Cloudflare's Asia-Pacific edges instead
// of the Azure CDN.
//
// Two routes:
//   GET /latest.json      → fetch GitHub's latest.json, rewrite each platform
//                           URL from github.com/... → this Worker's origin,
//                           return JSON. Short cache (signature/version may
//                           change between releases).
//   GET /<tag>/<filename> → reverse-proxy the GitHub release asset. Long
//                           cache (release assets are immutable).
//
// Anything else returns 404.
//
// Deploy: see ./README.md. After deploy, paste the worker.dev URL into
// scaffold/src-tauri/tauri.conf.json's plugins.updater.endpoints[0].

const GH_OWNER = "zgjsyxwj";
const GH_REPO = "gs-app";
const GH_RELEASE_BASE = `https://github.com/${GH_OWNER}/${GH_REPO}/releases`;

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405 });
    }

    if (url.pathname === "/latest.json") {
      return handleLatestJson(url, request, ctx);
    }

    // /<tag>/<filename> — anything else with a 2-segment path is treated as
    // a release artifact proxy. Reject other shapes to avoid being a generic
    // open proxy.
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 2 && segments[0].startsWith("v")) {
      return handleArtifact(segments[0], segments[1], request, ctx);
    }

    return new Response("not found", { status: 404 });
  },
};

async function handleLatestJson(url, request, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const ghRes = await fetch(`${GH_RELEASE_BASE}/latest/download/latest.json`, {
    cf: { cacheTtl: 60, cacheEverything: true },
    redirect: "follow",
  });
  if (!ghRes.ok) {
    return new Response(`upstream ${ghRes.status}`, { status: 502 });
  }

  const manifest = await ghRes.json();
  const origin = url.origin;

  // Rewrite every platform URL from github.com/.../releases/download/<tag>/<file>
  // to this Worker's <origin>/<tag>/<file>. The tag + filename pair is the
  // stable handle — signature stays as-is (minisign signs file content, not URL).
  for (const platform of Object.values(manifest.platforms ?? {})) {
    if (typeof platform.url !== "string") continue;
    const match = platform.url.match(
      /\/releases\/download\/([^/]+)\/([^/]+)$/,
    );
    if (!match) continue;
    const [, tag, filename] = match;
    platform.url = `${origin}/${tag}/${filename}`;
  }

  const body = JSON.stringify(manifest);
  const response = new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // 60s — long enough to absorb burst traffic right after a release,
      // short enough that a fresh release shows up within a minute.
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleArtifact(tag, filename, request, ctx) {
  // Filename guard — Tauri release artifacts follow strict patterns. Refuse
  // anything that smells off so this can't be turned into a generic redirector.
  if (!/^[A-Za-z0-9._-]+$/.test(tag) || !/^[A-Za-z0-9._%-]+$/.test(filename)) {
    return new Response("bad path", { status: 400 });
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    // For HEAD, strip the body but keep headers — saves bandwidth.
    return request.method === "HEAD"
      ? new Response(null, { status: cached.status, headers: cached.headers })
      : cached;
  }

  const ghUrl = `${GH_RELEASE_BASE}/download/${tag}/${filename}`;
  const ghRes = await fetch(ghUrl, {
    method: "GET", // always GET upstream — easier to cache; we strip body for HEAD below
    cf: { cacheTtl: 86400, cacheEverything: true },
    redirect: "follow",
  });

  if (!ghRes.ok) {
    return new Response(`upstream ${ghRes.status}`, { status: ghRes.status });
  }

  // Build a fresh response so we control caching headers. Release artifacts
  // are immutable (tag+filename uniquely identifies content) so we cache hard.
  const headers = new Headers(ghRes.headers);
  headers.set("cache-control", "public, max-age=86400, immutable");
  headers.set("access-control-allow-origin", "*");

  const response = new Response(ghRes.body, {
    status: ghRes.status,
    headers,
  });

  // Cache before returning. response.clone() lets us put one copy in cache
  // and return the other.
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}
