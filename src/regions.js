/* DEVERSE — on-demand admin-1 (states / provinces / regions) boundaries.
 *
 * The bundled world-atlas only carries country outlines, so the internal region
 * borders you see when you zoom deep into a country are fetched lazily from a
 * CDN (Natural Earth 50m admin-1, served by jsDelivr with permissive CORS) the
 * first time any country is opened, then kept in memory. Everything degrades
 * gracefully: if the network is blocked the deep-zoom view simply shows the
 * country without its internal subdivisions. Nothing is fetched until you
 * actually zoom into a country. */

const CDN =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson";

const DEG = Math.PI / 180;

function vec(lon, lat) {
  const la = lat * DEG, lo = lon * DEG, cl = Math.cos(la);
  return [cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo)];
}

/* Subdivide long segments so each region border hugs the sphere (mirrors geo.js). */
function densify(line, maxDeg) {
  const out = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    out.push(a);
    let dl = b[0] - a[0];
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    const dlat = b[1] - a[1];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dl), Math.abs(dlat)) / maxDeg));
    for (let s = 1; s < steps; s++) out.push([a[0] + (dl * s) / steps, a[1] + (dlat * s) / steps]);
  }
  out.push(line[line.length - 1]);
  return out;
}

function ringsFromGeometry(geometry, into) {
  if (!geometry) return;
  const pushLine = (line) => {
    if (!line || line.length < 2) return;
    const ln = densify(line, 2);
    const v = new Float32Array(ln.length * 3);
    for (let i = 0; i < ln.length; i++) {
      const p = vec(ln[i][0], ln[i][1]);
      v[i * 3] = p[0]; v[i * 3 + 1] = p[1]; v[i * 3 + 2] = p[2];
    }
    into.push(v);
  };
  const { type, coordinates } = geometry;
  if (type === "Polygon") for (const ring of coordinates) pushLine(ring);
  else if (type === "MultiPolygon") for (const poly of coordinates) for (const ring of poly) pushLine(ring);
}

/* Normalise a country name for matching world-atlas names against NE's `admin`. */
function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[.''-]/g, " ")
    .replace(/\b(dem|democratic|rep|republic|the|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let fcPromise = null; // memoised fetch of the whole admin-1 FeatureCollection
const cache = new Map(); // normalised country name → array of sphere rings

function loadAll() {
  if (!fcPromise) {
    fcPromise = fetch(CDN)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("admin-1 HTTP " + r.status))))
      .catch((e) => {
        fcPromise = null; // allow a later retry
        throw e;
      });
  }
  return fcPromise;
}

/* Region border rings for one country, as sphere unit-vector Float32Arrays.
 * Resolves to [] when the data can't be loaded or the country has no match, so
 * callers can cache the result and never re-request. */
export async function regionRingsFor(countryName) {
  const key = norm(countryName);
  if (cache.has(key)) return cache.get(key);

  let fc;
  try {
    fc = await loadAll();
  } catch {
    return []; // network blocked → no regions, country still shown
  }

  const rings = [];
  for (const feat of fc.features || []) {
    const admin = feat.properties && (feat.properties.admin || feat.properties.geonunit);
    if (norm(admin) !== key) continue;
    ringsFromGeometry(feat.geometry, rings);
  }
  cache.set(key, rings);
  return rings;
}
