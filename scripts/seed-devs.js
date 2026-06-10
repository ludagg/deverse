/* DEVERSE — seed the database with real GitHub developers.
 *
 *   GITHUB_TOKEN=ghp_xxx DATABASE_URL=postgres://… npm run seed
 *
 * For each city in the dataset it asks the GitHub Search API for the
 * most-followed users located there, pulls their profile + repos, and upserts
 * them with `source='seed'`. The city/coords come from our own table (the
 * search was *by* that city), so the location on the map is always correct.
 *
 * Re-running refreshes stars/followers/etc. Needs a read-only token (public
 * scope is enough) — Search has a 30 req/min cap, so this takes a few minutes. */

import process from "node:process";
import D from "../src/data.js";
import { db, upsertDeveloper, connString } from "../api/_db.js";

const TOKEN = process.env.GITHUB_TOKEN;
const PER_CITY = Number(process.env.SEED_PER_CITY || 6);
const GH = "https://api.github.com";

if (!TOKEN) {
  console.error("Set GITHUB_TOKEN (a read-only Personal Access Token).");
  process.exit(1);
}
if (!connString()) {
  console.error("Set DATABASE_URL (or POSTGRES_URL) — your Postgres connection string.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jit = (v, amt) => v + (Math.random() - 0.5) * amt;

async function gh(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(GH + path, {
      headers: {
        authorization: "Bearer " + TOKEN,
        accept: "application/vnd.github+json",
        "user-agent": "deverse-seed",
      },
    });
    if (r.status === 403 || r.status === 429) {
      const reset = Number(r.headers.get("x-ratelimit-reset")) * 1000;
      const wait = Math.max(2000, reset - Date.now() + 1000);
      console.warn(`  rate-limited, waiting ${Math.round(wait / 1000)}s…`);
      await sleep(Math.min(wait, 65000));
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.json();
  }
  throw new Error("giving up after repeated rate-limits: " + path);
}

const FOCUS = {
  Rust: "Systems", Zig: "Systems", C: "Systems", "C++": "Systems",
  Go: "Backend", Python: "Data / ML", "Jupyter Notebook": "Data / ML", R: "Data / ML",
  TypeScript: "Full-stack", JavaScript: "Frontend", Vue: "Frontend", Svelte: "Frontend",
  Swift: "Mobile", Kotlin: "Mobile", Dart: "Mobile", "Objective-C": "Mobile",
  Java: "Backend", Ruby: "Backend", PHP: "Backend", Elixir: "Backend",
  Solidity: "Blockchain", Shell: "DevOps / SRE", HCL: "DevOps / SRE", GLSL: "Graphics",
};
const focusFromLangs = (langs) => {
  for (const l of langs) if (FOCUS[l]) return FOCUS[l];
  return langs.length ? "Polyglot" : "Open source";
};

async function buildFromGitHub(login, city) {
  const user = await gh(`/users/${encodeURIComponent(login)}`);
  let repos = [];
  try {
    repos = await gh(`/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed&type=owner`);
  } catch {
    /* repos best-effort */
  }
  let stars = 0;
  const langCount = {};
  for (const r of repos) {
    if (r.fork) continue;
    stars += r.stargazers_count || 0;
    if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
  }
  const langs = Object.keys(langCount).sort((a, b) => langCount[b] - langCount[a]).slice(0, 6);
  const years = user.created_at
    ? Math.max(1, Math.round((Date.now() - new Date(user.created_at).getTime()) / 3.15576e10))
    : 1;
  return {
    github_id: user.id,
    login: user.login,
    name: user.name || user.login,
    avatar_url: user.avatar_url,
    bio: user.bio || "",
    html_url: user.html_url,
    location_raw: user.location || city.city,
    city: city.city, // authoritative: we searched by this city
    country: city.country,
    lat: jit(city.lat, 1.6),
    lon: jit(city.lon, 1.6),
    langs,
    focus: focusFromLangs(langs),
    years,
    repos: user.public_repos || 0,
    stars,
    followers: user.followers || 0,
    status: "offline",
    source: "seed",
  };
}

async function main() {
  const sql = db();
  const seen = new Set();
  let total = 0;

  for (const city of D.cities) {
    const q = encodeURIComponent(`location:"${city.city}" followers:>5`);
    let logins = [];
    try {
      const search = await gh(`/search/users?q=${q}&sort=followers&order=desc&per_page=${PER_CITY}`);
      logins = (search.items || []).map((u) => u.login);
    } catch (e) {
      console.warn(`! search failed for ${city.city}: ${e.message}`);
    }
    console.log(`${city.city}: ${logins.length} candidates`);

    for (const login of logins) {
      try {
        const dev = await buildFromGitHub(login, city);
        if (seen.has(dev.github_id)) continue;
        seen.add(dev.github_id);
        await upsertDeveloper(sql, dev);
        total++;
        console.log(`  ✓ @${dev.login} (${dev.stars}★, ${dev.followers} followers)`);
      } catch (e) {
        console.warn(`  ! ${login}: ${e.message}`);
      }
      await sleep(120); // gentle on the core API
    }
    await sleep(2200); // stay under the Search API's 30 req/min cap
  }

  console.log(`\nDone. Upserted ${total} real developers.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
