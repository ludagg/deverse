/* DEVERSE — Postgres access layer for the serverless functions.
 *
 * Provider-agnostic: works with any Postgres (Supabase, Neon, Vercel Postgres)
 * via the DATABASE_URL connection string. When DATABASE_URL is absent the app
 * still runs — the API returns an empty set and the front falls back to the
 * bundled dataset. Use the *pooled* connection string in serverless (Supabase:
 * the "Transaction" pooler URL); `prepare: false` keeps it pgbouncer-safe. */

import postgres from "postgres";

let sql = null;

/* Resolve a Postgres connection string from the common env-var names. The
 * Vercel↔Supabase / Vercel Postgres integrations inject POSTGRES_URL etc.
 * rather than DATABASE_URL, so accept all of them (pooled URLs first). */
export function connString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null
  );
}

export function db() {
  const url = connString();
  if (!url) return null;
  if (!sql) {
    sql = postgres(url, {
      ssl: "require",
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

/* A DB row → the developer shape the front-end consumes. */
export function rowToDev(r) {
  return {
    id: Number(r.github_id),
    real: true,
    login: r.login,
    name: r.name || r.login,
    handle: "@" + r.login,
    city: r.city || r.location_raw || "Somewhere",
    country: r.country || "",
    lat: r.lat != null ? Number(r.lat) : null,
    lon: r.lon != null ? Number(r.lon) : null,
    located: r.lat != null,
    langs: Array.isArray(r.langs) ? r.langs : [],
    focus: r.focus || "Open source",
    years: r.years || 1,
    status: r.status || "offline",
    repos: r.repos || 0,
    stars: r.stars || 0,
    followers: r.followers || 0,
    tagline: r.bio || "on github, on the map",
    avatarUrl: r.avatar_url,
    htmlUrl: r.html_url,
    connections: [],
  };
}

/* Insert or update one developer (used by both the OAuth callback and the seed
 * script). Coordinates/city/country are only overwritten when provided, so a
 * sign-in can't wipe a good seeded location with a blank one. */
export async function upsertDeveloper(s, d) {
  await s`
    insert into developers
      (github_id, login, name, avatar_url, bio, html_url, location_raw,
       city, country, lat, lon, langs, focus, years, repos, stars, followers,
       status, source, last_seen, updated_at)
    values
      (${d.github_id}, ${d.login}, ${d.name || null}, ${d.avatar_url || null},
       ${d.bio || null}, ${d.html_url || null}, ${d.location_raw || null},
       ${d.city || null}, ${d.country || null}, ${d.lat ?? null}, ${d.lon ?? null},
       ${s.json(d.langs || [])}, ${d.focus || null}, ${d.years || 1},
       ${d.repos || 0}, ${d.stars || 0}, ${d.followers || 0},
       ${d.status || "offline"}, ${d.source || "seed"}, now(), now())
    on conflict (github_id) do update set
      login = excluded.login,
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      bio = excluded.bio,
      html_url = excluded.html_url,
      location_raw = excluded.location_raw,
      city = coalesce(excluded.city, developers.city),
      country = coalesce(excluded.country, developers.country),
      lat = coalesce(excluded.lat, developers.lat),
      lon = coalesce(excluded.lon, developers.lon),
      langs = excluded.langs,
      focus = excluded.focus,
      years = excluded.years,
      repos = excluded.repos,
      stars = excluded.stars,
      followers = excluded.followers,
      status = excluded.status,
      last_seen = now(),
      updated_at = now()
  `;
}
