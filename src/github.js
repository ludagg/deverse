/* DEVERSE — GitHub integration.
 *
 * Two paths to a real developer, both producing the SAME profile shape:
 *   1. OAuth (authorization-code) — the button redirects to GitHub, and the
 *      returned code is exchanged by our serverless function (api/github-callback.js),
 *      which keeps the client secret server-side. Enabled when VITE_GITHUB_CLIENT_ID
 *      is set at build time.
 *   2. Public API by username — no token, no backend (60 req/h per IP). Used as
 *      the fallback when OAuth isn't configured, so the feature still shows real
 *      data immediately.
 *
 * A normalised profile is then geocoded (Nominatim / OpenStreetMap) and assembled
 * into a "developer" object that slots straight into the seeded dataset's shape,
 * so a real user can be pinned on the globe alongside the fiction. */

const GH_API = "https://api.github.com";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// The OAuth Client ID is public and safe to ship; its presence flips the sign-in
// button from the username fallback to the real OAuth redirect.
export const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || "";
export const oauthConfigured = () => Boolean(CLIENT_ID);

const STATE_KEY = "deverse_oauth_state";
const GEO_CACHE = "deverse_geocache";
const ID_OFFSET = 1_000_000; // keep real ids clear of the 0..N seeded ids

/* ---------------- OAuth (authorization-code) ---------------- */

const redirectUri = () => window.location.origin + "/";

/* Send the browser to GitHub's consent screen. */
export function beginOAuth() {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* private mode — the state check below will just be skipped */
  }
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: "read:user",
    state,
    allow_signup: "true",
  });
  window.location.assign("https://github.com/login/oauth/authorize?" + p.toString());
}

/* If we came back from GitHub with ?code=&state=, validate state, strip the
 * params from the URL, and return the code. Returns null otherwise. */
export function pendingOAuthCode() {
  const p = new URLSearchParams(window.location.search);
  const code = p.get("code");
  const state = p.get("state");
  if (!code) return null;

  let want = null;
  try {
    want = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }

  // always clean the OAuth params out of the visible URL
  p.delete("code");
  p.delete("state");
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? "?" + qs : window.location.pathname);

  if (want && want !== state) return null; // CSRF guard
  return code;
}

/* Exchange the code for a normalised profile via the serverless function. */
export async function exchangeOAuthCode(code) {
  const r = await fetch("/api/github-callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri() }),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* ignore parse error */
  }
  if (!r.ok) throw new Error((json && json.error) || "Sign-in failed (" + r.status + ").");
  return json;
}

/* ---------------- Public-API fallback (no token) ---------------- */

export async function fetchPublicProfile(login) {
  const handle = encodeURIComponent(login);
  const u = await fetch(`${GH_API}/users/${handle}`);
  if (u.status === 404) throw new Error("No GitHub user “" + login + "”.");
  if (u.status === 403) throw new Error("GitHub rate limit reached — try again shortly.");
  if (!u.ok) throw new Error("GitHub error (" + u.status + ").");
  const user = await u.json();

  let repos = [];
  try {
    const rr = await fetch(`${GH_API}/users/${handle}/repos?per_page=100&sort=pushed&type=owner`);
    if (rr.ok) repos = await rr.json();
  } catch {
    /* repos are best-effort; profile alone is enough to pin someone */
  }
  return normalizeProfile(user, repos);
}

/* ---------------- Normalisation ---------------- */

/* Collapse the GitHub user + repos payloads into DEVERSE's profile shape.
 * Mirrors normalize() in api/github-callback.js — keep the two in sync. */
export function normalizeProfile(user, repos) {
  let stars = 0;
  const langCount = {};
  for (const r of repos || []) {
    if (r.fork) continue;
    stars += r.stargazers_count || 0;
    if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
  }
  const langs = Object.keys(langCount)
    .sort((a, b) => langCount[b] - langCount[a])
    .slice(0, 6);
  return {
    login: user.login,
    github_id: user.id,
    name: user.name || user.login,
    avatar_url: user.avatar_url,
    bio: user.bio || "",
    html_url: user.html_url || "https://github.com/" + user.login,
    location: user.location || "",
    company: user.company || "",
    created_at: user.created_at,
    public_repos: user.public_repos || (repos ? repos.length : 0),
    followers: user.followers || 0,
    stars,
    langs,
  };
}

/* Map a stack to a rough focus label, for parity with the seeded dataset. */
export function deriveFocus(langs) {
  const byLang = {
    Rust: "Systems",
    Zig: "Systems",
    C: "Systems",
    "C++": "Systems",
    Go: "Backend",
    Python: "Data / ML",
    Jupyter: "Data / ML",
    "Jupyter Notebook": "Data / ML",
    R: "Data / ML",
    TypeScript: "Full-stack",
    JavaScript: "Frontend",
    Vue: "Frontend",
    Svelte: "Frontend",
    Swift: "Mobile",
    Kotlin: "Mobile",
    Dart: "Mobile",
    "Objective-C": "Mobile",
    Java: "Backend",
    Ruby: "Backend",
    PHP: "Backend",
    Elixir: "Backend",
    Solidity: "Blockchain",
    Shell: "DevOps / SRE",
    HCL: "DevOps / SRE",
    GLSL: "Graphics",
  };
  for (const l of langs) if (byLang[l]) return byLang[l];
  return langs.length ? "Polyglot" : "Open source";
}

/* ---------------- Geocoding (Nominatim / OpenStreetMap) ---------------- */

function readGeoCache() {
  try {
    return JSON.parse(localStorage.getItem(GEO_CACHE) || "{}");
  } catch {
    return {};
  }
}
function writeGeoCache(c) {
  try {
    localStorage.setItem(GEO_CACHE, JSON.stringify(c));
  } catch {
    /* quota / private mode */
  }
}

/* Resolve free-text `location` to { lat, lon, city, country }, cached locally.
 * Returns null when empty, not found, or the service is unreachable. */
export async function geocode(location) {
  const q = (location || "").trim();
  if (!q) return null;
  const key = q.toLowerCase();

  const cache = readGeoCache();
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];

  const p = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
  });

  let hit = null;
  try {
    const r = await fetch(`${NOMINATIM}?${p.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr[0]) {
        const a = arr[0].address || {};
        hit = {
          lat: Number(arr[0].lat),
          lon: Number(arr[0].lon),
          city: a.city || a.town || a.village || a.municipality || a.state || a.county || q,
          country: a.country || "",
        };
      }
    }
  } catch {
    return null; // offline / blocked → leave unlocated, don't poison the cache
  }

  cache[key] = hit; // cache misses too, so we don't re-hit Nominatim for the same string
  writeGeoCache(cache);
  return hit;
}

/* ---------------- Assembly ---------------- */

function hashLogin(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* Build a globe-ready "developer" from a normalised profile (geocoding inline). */
export async function buildDeveloper(profile) {
  const geo = await geocode(profile.location);
  const years = profile.created_at
    ? Math.max(1, Math.round((Date.now() - new Date(profile.created_at).getTime()) / 3.15576e10))
    : 1;
  const id = ID_OFFSET + (Number.isFinite(profile.github_id) ? profile.github_id : hashLogin(profile.login));
  return {
    id,
    real: true,
    login: profile.login,
    name: profile.name,
    handle: "@" + profile.login,
    city: geo ? geo.city : profile.location || "Somewhere",
    country: geo ? geo.country : "",
    lat: geo ? geo.lat : null,
    lon: geo ? geo.lon : null,
    located: Boolean(geo),
    langs: profile.langs.length ? profile.langs : ["—"],
    focus: deriveFocus(profile.langs),
    years,
    status: "online",
    repos: profile.public_repos,
    stars: profile.stars,
    followers: profile.followers,
    tagline: profile.bio || "on github, on the map",
    avatarUrl: profile.avatar_url,
    avatar: hashLogin(profile.login),
    htmlUrl: profile.html_url,
    connections: [],
  };
}
