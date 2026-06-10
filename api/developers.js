/* DEVMAP — GET /api/developers
 * Returns every developer on the map (real, from the database). When no
 * DATABASE_URL is configured it returns an empty array so the front-end falls
 * back to the bundled dataset — the app keeps working before the DB is set up.
 *
 * Availability hardening: responses are cached hard at the CDN edge AND in the
 * instance's memory, the DB query is time-boxed, and a generous per-IP limit
 * caps abuse. The goal is that a traffic spike is absorbed by caches and never
 * turns into a flood of database queries. */

import { db, rowToDev } from "./_db.js";
import { rateLimit } from "./_limit.js";

let memo = { at: 0, body: null }; // per-instance cache of the serialised payload
const MEMO_TTL = 60_000;

function clientIp(req) {
  const xff = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "";
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  // generous safety limit — normal use is fully served by the caches below, so
  // this only ever bites a client hammering past the cache on a warm instance
  const rl = rateLimit("devs:" + clientIp(req), { limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    res.statusCode = 429;
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.end(JSON.stringify({ error: "Rate limit exceeded." }));
  }

  // long edge cache + stale-while-revalidate so the CDN absorbs spikes
  res.setHeader("cache-control", "public, max-age=30, s-maxage=300, stale-while-revalidate=3600");

  // serve the in-memory copy if it's fresh — no DB round-trip
  if (memo.body && Date.now() - memo.at < MEMO_TTL) {
    res.statusCode = 200;
    return res.end(memo.body);
  }

  const sql = db();
  if (!sql) {
    res.statusCode = 200;
    return res.end(JSON.stringify([]));
  }

  try {
    const query = sql`
      select github_id, login, name, avatar_url, bio, html_url, location_raw,
             city, country, lat, lon, langs, focus, years, repos, stars,
             followers, status
      from developers
      order by stars desc nulls last
      limit 2000
    `;
    // time-box the query so a slow/locked DB can't hang the function open
    // (generous — a normal read is a few ms; this only trips on a real stall)
    const rows = await Promise.race([
      query,
      new Promise((_, rej) => setTimeout(() => rej(new Error("db timeout")), 8000)),
    ]);
    const body = JSON.stringify(rows.map(rowToDev));
    memo = { at: Date.now(), body };
    res.statusCode = 200;
    return res.end(body);
  } catch {
    // degrade gracefully: serve the last good copy if we have one, else let the
    // front fall back to the bundled fiction by returning an empty set
    res.statusCode = 200;
    return res.end(memo.body || JSON.stringify([]));
  }
}
