/* DEVMAP — serverless GitHub OAuth token exchange (Vercel Node function).
 *
 * The browser sends the authorization `code` here; we swap it for an access
 * token using the *server-only* client secret, then read the user's public
 * profile and repositories and return a normalised profile. The access token
 * never leaves the server. Configure with the GITHUB_CLIENT_ID /
 * GITHUB_CLIENT_SECRET environment variables (see .env.example). */

import { db, upsertDeveloper } from "./_db.js";
import { geocode, geocodeIp } from "./_geo.js";
import { fetchT } from "./_http.js";
import { rateLimit } from "./_limit.js";

const GH = "https://api.github.com";

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  // throttle this expensive path (GitHub + geocoder + DB) per client, so it
  // can't be spammed into exhausting quotas or the database connection
  const ip = clientIp(req);
  const rl = rateLimit("cb:" + ip, { limit: 12, windowMs: 60_000 });
  if (!rl.ok) {
    res.statusCode = 429;
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.end(JSON.stringify({ error: "Too many sign-in attempts — please wait a moment." }));
  }

  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "OAuth is not configured on the server." }));
  }

  let code = "";
  let redirectUri = "";
  try {
    const body = await readJson(req);
    code = body.code || "";
    redirectUri = body.redirect_uri || "";
  } catch {
    /* fall through to the validation error below */
  }
  // validate inputs: a GitHub code is a short opaque token; reject anything
  // that isn't, and cap the redirect_uri length (it's checked by GitHub too)
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{8,512}$/.test(code)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Missing or invalid authorization code." }));
  }
  if (typeof redirectUri !== "string" || redirectUri.length > 512) redirectUri = "";

  try {
    const tokenRes = await fetchT("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }),
    }, 12000);
    const tokenJson = await tokenRes.json();
    const token = tokenJson.access_token;
    if (!token) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: tokenJson.error_description || "Token exchange was rejected." }));
    }

    const gh = (path) =>
      fetchT(GH + path, {
        headers: {
          authorization: "Bearer " + token,
          accept: "application/vnd.github+json",
          "user-agent": "devmap",
        },
      }, 12000);

    const userRes = await gh("/user");
    if (!userRes.ok) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "Could not read the GitHub profile." }));
    }
    const user = await userRes.json();

    let repos = [];
    const reposRes = await gh("/user/repos?per_page=100&sort=pushed&type=owner");
    if (reposRes.ok) repos = await reposRes.json();

    const profile = normalize(user, repos);
    // resolve the GitHub free-text location; if there isn't one (or it doesn't
    // geocode), fall back to the sign-in IP so the developer still gets pinned
    // and persisted — the map doesn't stay empty for location-less profiles
    let geo = await geocode(profile.location);
    if (!geo) geo = await geocodeIp(ip);
    const dev = toDeveloper(profile, geo);

    // persist & share: the signed-in user shows up on everyone's map
    const sql = db();
    if (sql) {
      try {
        await upsertDeveloper(sql, {
          github_id: profile.github_id,
          login: profile.login,
          name: profile.name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          html_url: profile.html_url,
          location_raw: profile.location,
          city: dev.city,
          country: dev.country,
          lat: dev.lat,
          lon: dev.lon,
          langs: profile.langs,
          focus: dev.focus,
          years: dev.years,
          repos: profile.public_repos,
          stars: profile.stars,
          followers: profile.followers,
          status: "online",
          source: "signin",
        });
      } catch {
        /* never fail sign-in because of a DB hiccup */
      }
    }

    res.statusCode = 200;
    return res.end(JSON.stringify(dev));
  } catch {
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: "GitHub request failed." }));
  }
}

/* The originating client IP, from the proxy headers Vercel sets (the first
 * entry of x-forwarded-for is the real client), falling back to the socket. */
function clientIp(req) {
  const xff = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "";
}

/* Read and JSON-parse the request body (raw Node stream), capped at 8 KB so a
 * giant payload can't be used to exhaust the function's memory. */
function readJson(req) {
  const MAX = 8 * 1024;
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > MAX) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/* Focus label from a stack — mirrors deriveFocus() in src/github.js. */
function focusFromLangs(langs) {
  const m = {
    Rust: "Systems", Zig: "Systems", C: "Systems", "C++": "Systems",
    Go: "Backend", Python: "Data / ML", Jupyter: "Data / ML", "Jupyter Notebook": "Data / ML", R: "Data / ML",
    TypeScript: "Full-stack", JavaScript: "Frontend", Vue: "Frontend", Svelte: "Frontend",
    Swift: "Mobile", Kotlin: "Mobile", Dart: "Mobile", "Objective-C": "Mobile",
    Java: "Backend", Ruby: "Backend", PHP: "Backend", Elixir: "Backend",
    Solidity: "Blockchain", Shell: "DevOps / SRE", HCL: "DevOps / SRE", GLSL: "Graphics",
  };
  for (const l of langs) if (m[l]) return m[l];
  return langs.length ? "Polyglot" : "Open source";
}

/* Normalised profile (+ optional geocode) → the developer shape the front uses. */
function toDeveloper(p, geo) {
  const years = p.created_at
    ? Math.max(1, Math.round((Date.now() - new Date(p.created_at).getTime()) / 3.15576e10))
    : 1;
  return {
    id: p.github_id,
    real: true,
    login: p.login,
    name: p.name,
    handle: "@" + p.login,
    city: geo ? geo.city : p.location || "Somewhere",
    country: geo ? geo.country : "",
    lat: geo ? geo.lat : null,
    lon: geo ? geo.lon : null,
    located: Boolean(geo),
    langs: p.langs,
    focus: focusFromLangs(p.langs),
    years,
    status: "online",
    repos: p.public_repos,
    stars: p.stars,
    followers: p.followers,
    tagline: p.bio || "on github, on the map",
    avatarUrl: p.avatar_url,
    htmlUrl: p.html_url,
    connections: [],
  };
}

/* Collapse the GitHub user + repos payloads into DEVMAP's profile shape.
 * Mirrors normalizeProfile() in src/github.js — keep the two in sync. */
function normalize(user, repos) {
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
    html_url: user.html_url,
    location: user.location || "",
    company: user.company || "",
    created_at: user.created_at,
    public_repos: user.public_repos || (repos ? repos.length : 0),
    followers: user.followers || 0,
    stars,
    langs,
  };
}
