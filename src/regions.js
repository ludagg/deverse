/* DEVMAP — on-demand admin-1 (states / provinces / regions) boundaries.
 *
 * The bundled world-atlas only carries country outlines, so the internal region
 * borders are fetched lazily, one country at a time, from geoBoundaries
 * (https://www.geoboundaries.org) — an open dataset with global ADM1 coverage
 * and permissive CORS. (Natural Earth's low-resolution admin-1 only ships a
 * handful of big federal countries, which is why most countries used to draw no
 * regions at all.)
 *
 * Per country we fetch the simplified GeoJSON once and cache it, then serve it
 * in two shapes: sphere-ready line rings for the globe, and raw lon/lat rings
 * for the flat country map. Everything degrades gracefully: countries with no
 * ADM1 data (Antarctica, micro-states…) or a blocked network simply show no
 * subdivisions. Nothing is fetched until you actually open a country. */

const API = "https://www.geoboundaries.org/api/current/gbOpen/";

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

/* Collect every boundary ring (as raw lon/lat point arrays) from a geometry. */
function lonLatRings(geometry, into) {
  if (!geometry) return;
  const { type, coordinates } = geometry;
  if (type === "Polygon") for (const ring of coordinates) into.push(ring);
  else if (type === "MultiPolygon") for (const poly of coordinates) for (const ring of poly) into.push(ring);
  else if (type === "GeometryCollection") for (const g of geometry.geometries) lonLatRings(g, into);
}

/* geoBoundaries points at github.com/<o>/<r>/raw/… , but those files are stored
 * in Git LFS: that URL 302-redirects to media.githubusercontent.com, and the
 * redirect itself carries no CORS header, so a browser fetch of it fails. Hit
 * the media host directly — it serves the LFS content with permissive CORS and
 * no redirect. (raw.githubusercontent.com would only return the LFS pointer.) */
function cdnify(url) {
  return url.replace(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/(.+)$/,
    "https://media.githubusercontent.com/media/$1/$2/$3",
  );
}

// ISO3 → promise of raw lon/lat rings (memoised, so each country is fetched once)
const cache = new Map();

/* Fetch a country's ADM1 rings as raw lon/lat point arrays. Resolves to [] when
 * there's no data or the network is blocked. */
export function regionPolygonsFor(iso3) {
  if (!iso3) return Promise.resolve([]);
  if (cache.has(iso3)) return cache.get(iso3);

  const p = (async () => {
    try {
      const metaRes = await fetch(API + iso3 + "/ADM1/");
      if (!metaRes.ok) return [];
      const meta = await metaRes.json();
      const url = meta && (meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL);
      if (!url) return [];
      const fcRes = await fetch(cdnify(url));
      if (!fcRes.ok) return [];
      const fc = await fcRes.json();
      const rings = [];
      for (const feat of fc.features || []) lonLatRings(feat.geometry, rings);
      return rings;
    } catch {
      return []; // network blocked / parse error → no regions, country still shown
    }
  })();

  cache.set(iso3, p);
  return p;
}

/* Same data as sphere unit-vector Float32Arrays, for the globe renderer. */
export async function regionRingsFor(iso3) {
  const rings = await regionPolygonsFor(iso3);
  return rings.map((line) => {
    const ln = densify(line, 1.5);
    const v = new Float32Array(ln.length * 3);
    for (let i = 0; i < ln.length; i++) {
      const p = vec(ln[i][0], ln[i][1]);
      v[i * 3] = p[0]; v[i * 3 + 1] = p[1]; v[i * 3 + 2] = p[2];
    }
    return v;
  });
}
