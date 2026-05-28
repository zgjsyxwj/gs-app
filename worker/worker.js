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
//                           and replace the baked single-release `notes` with a
//                           changelog grouped by version, covering every release
//                           the client hasn't seen. The client passes its
//                           version via `?current=<x.y.z>` (Tauri's
//                           {{current_version}}); without it the baked notes are
//                           served unchanged. Short cache, keyed by full URL so
//                           each `current` value caches independently.
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405 });
    }

    if (url.pathname === "/latest.json") {
      return handleLatestJson(url, request, env, ctx);
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

async function handleLatestJson(url, request, env, ctx) {
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

  // Replace the single-release `notes` with the full span of versions the
  // client hasn't seen. Any failure (rate limit, unknown tag, network) leaves
  // the baked notes untouched, so the updater still works.
  const notes = await buildChangelog(url, manifest, env).catch((e) => {
    console.log("changelog build failed, keeping baked notes:", e);
    return null;
  });
  if (notes) manifest.notes = notes;

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

// Build a changelog grouped by version, one section per release the client
// hasn't seen yet, newest version first. Needs the client's version via
// `?current=<x.y.z>` (Tauri's {{current_version}}); without it — or on any
// failure — returns null, so the baked single-release notes are served as-is
// and the updater never breaks on a changelog problem.
async function buildChangelog(url, manifest, env) {
  const version = String(manifest.version ?? "").replace(/^v/, "");
  const current = (url.searchParams.get("current") ?? "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+/.test(version) || !/^\d+\.\d+\.\d+/.test(current)) return null;
  if (cmpSemver(current, version) >= 0) return null;

  const tags = await ghApi(`/repos/${GH_OWNER}/${GH_REPO}/tags?per_page=100`, env);
  if (!Array.isArray(tags)) return null;
  const names = tags
    .map((t) => t?.name)
    .filter((n) => typeof n === "string" && /^v\d+\.\d+\.\d+/.test(n))
    .sort((a, b) => cmpSemver(a, b)); // oldest first

  // A version's own log is the commits since the tag just below it. Walk the
  // versions in (current, latest] newest first, one compare call each. Versions
  // that share a commit with their predecessor produce an empty section and are
  // skipped.
  const sections = [];
  for (let i = names.length - 1; i >= 0; i--) {
    const tag = names[i];
    if (cmpSemver(tag, version) > 0 || cmpSemver(tag, current) <= 0) continue;
    const prev = i > 0 ? names[i - 1] : `v${current}`;
    const cmp = await ghApi(
      `/repos/${GH_OWNER}/${GH_REPO}/compare/${prev}...${tag}`,
      env,
    );
    const lines = commitLines(cmp);
    if (lines.length) sections.push(`${tag.replace(/^v/, "")}\n${lines.join("\n")}`);
  }
  return sections.length ? sections.join("\n\n") : null;
}

// Commit subjects from a compare response, newest first, deduped, merges dropped.
function commitLines(cmp) {
  const commits = Array.isArray(cmp?.commits) ? cmp.commits : [];
  const lines = [];
  const seen = new Set();
  for (let i = commits.length - 1; i >= 0; i--) {
    const subject = String(commits[i]?.commit?.message ?? "")
      .split("\n")[0]
      .trim();
    if (!subject || subject.startsWith("Merge ") || seen.has(subject)) continue;
    seen.add(subject);
    lines.push(`- ${subject}`);
  }
  return lines;
}

async function ghApi(path, env) {
  const headers = {
    "user-agent": "pivot-desk-updater-worker",
    accept: "application/vnd.github+json",
  };
  // Optional: set a GH_TOKEN secret to lift the 60 req/hr unauthenticated
  // limit to 5000/hr. Works fine without it for low traffic.
  if (env?.GH_TOKEN) headers.authorization = `Bearer ${env.GH_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, {
    headers,
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) {
    console.log(`gh api ${path} -> ${res.status}`);
    return null;
  }
  return res.json();
}

function cmpSemver(a, b) {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}
