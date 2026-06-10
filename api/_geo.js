/* DEVERSE — server-side geocoding (Nominatim / OpenStreetMap).
 *
 * Sign-in locations are resolved here so the resulting pin is the same for
 * everyone (it's persisted in the DB), not just in one browser. Nominatim's
 * usage policy requires a descriptive User-Agent on server requests. */

export async function geocode(location) {
  const q = (location || "").trim();
  if (!q) return null;
  const p = new URLSearchParams({ q, format: "jsonv2", limit: "1", addressdetails: "1" });
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + p.toString(), {
      headers: { "user-agent": "deverse (github map)", accept: "application/json" },
    });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr[0]) return null;
    const a = arr[0].address || {};
    return {
      lat: Number(arr[0].lat),
      lon: Number(arr[0].lon),
      city: a.city || a.town || a.village || a.municipality || a.state || a.county || q,
      country: a.country || "",
    };
  } catch {
    return null;
  }
}
