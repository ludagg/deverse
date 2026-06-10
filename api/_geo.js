/* DEVMAP — server-side geocoding (Nominatim / OpenStreetMap).
 *
 * Sign-in locations are resolved here so the resulting pin is the same for
 * everyone (it's persisted in the DB), not just in one browser. Nominatim's
 * usage policy requires a descriptive User-Agent on server requests. Every
 * outbound call is time-boxed (fetchT) so a slow upstream can't hang the
 * function. */

import { fetchT } from "./_http.js";

/* True for loopback / RFC-1918 private addresses, which can't be geolocated. */
function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true; // IPv6 private
  return false;
}

const UA = { headers: { accept: "application/json", "user-agent": "deverse (github map)" } };

/* Coordinates that resolved to the null island are treated as "not found". */
function ok(lat, lon) {
  return typeof lat === "number" && typeof lon === "number" && (lat !== 0 || lon !== 0);
}

/* freeipapi.com — HTTPS, no key. */
async function fromFreeIpApi(addr) {
  try {
    const r = await fetchT("https://freeipapi.com/api/json/" + encodeURIComponent(addr), UA, 7000);
    if (!r.ok) return null;
    const j = await r.json();
    if (!ok(j.latitude, j.longitude)) return null;
    return { lat: j.latitude, lon: j.longitude, city: j.cityName || j.countryName || "", country: j.countryName || "" };
  } catch {
    return null;
  }
}

/* ip-api.com — HTTP-only on the free tier, fine for a server-side fallback. */
async function fromIpApi(addr) {
  try {
    const r = await fetchT("http://ip-api.com/json/" + encodeURIComponent(addr) + "?fields=status,lat,lon,city,country", UA, 7000);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== "success" || !ok(j.lat, j.lon)) return null;
    return { lat: j.lat, lon: j.lon, city: j.city || j.country || "", country: j.country || "" };
  } catch {
    return null;
  }
}

/* Approximate location from an IP address, used as a fallback at sign-in when a
 * developer's GitHub profile has no usable location — so they still land on the
 * map (and get persisted) instead of staying unlocated. Tries a couple of free,
 * keyless services. Returns null for private/loopback IPs or any failure. */
export async function geocodeIp(ip) {
  const addr = (ip || "").trim();
  if (isPrivateIp(addr)) return null;
  return (await fromFreeIpApi(addr)) || (await fromIpApi(addr));
}

export async function geocode(location) {
  const q = (location || "").trim();
  if (!q) return null;
  const p = new URLSearchParams({ q, format: "jsonv2", limit: "1", addressdetails: "1" });
  try {
    const r = await fetchT("https://nominatim.openstreetmap.org/search?" + p.toString(), {
      headers: { "user-agent": "devmap (github map; +https://devmap.world)", accept: "application/json" },
    }, 9000);
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
