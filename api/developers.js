/* DEVMAP — GET /api/developers
 * Returns every developer on the map (real, from the database). When no
 * DATABASE_URL is configured it returns an empty array so the front-end falls
 * back to the bundled dataset — the app keeps working before the DB is set up. */

import { db, rowToDev } from "./_db.js";

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const sql = db();
  if (!sql) {
    res.statusCode = 200;
    return res.end(JSON.stringify([]));
  }

  try {
    const rows = await sql`
      select github_id, login, name, avatar_url, bio, html_url, location_raw,
             city, country, lat, lon, langs, focus, years, repos, stars,
             followers, status
      from developers
      order by stars desc nulls last
      limit 2000
    `;
    // a short edge cache keeps the map snappy without going stale for long
    res.setHeader("cache-control", "public, max-age=30, s-maxage=120, stale-while-revalidate=600");
    res.statusCode = 200;
    return res.end(JSON.stringify(rows.map(rowToDev)));
  } catch {
    res.statusCode = 200; // degrade gracefully → front falls back to fiction
    return res.end(JSON.stringify([]));
  }
}
