/* DEVERSE — on-demand admin-1 (states / provinces / regions) boundaries.
 *
 * The bundled world-atlas only carries country outlines, so the internal region
 * borders you see when you zoom deep into a country are fetched lazily, one
 * country at a time, from geoBoundaries (https://www.geoboundaries.org) — an
 * open dataset with global ADM1 coverage and permissive CORS. (Natural Earth's
 * low-resolution admin-1 only ships a handful of big federal countries, which
 * is why most countries used to draw no regions at all.)
 *
 * Flow per country: the geoBoundaries API returns metadata pointing at a
 * simplified GeoJSON, which we fetch and convert to sphere-ready line rings.
 * Everything is cached and degrades gracefully: countries with no ADM1 data
 * (Antarctica, tiny states…) or a blocked network simply show no subdivisions.
 * Nothing is fetched until you actually zoom into a country. */

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

function ringsFromGeometry(geometry, into) {
  if (!geometry) return;
  const pushLine = (line) => {
    if (!line || line.length < 2) return;
    const ln = densify(line, 1.5);
    const v = new Float32Array(ln.length * 3);
    for (let i = 0; i < ln.length; i++) {
      const p = vec(ln[i][0], ln[i][1]);
      v[i * 3] = p[0]; v[i * 3 + 1] = p[1]; v[i * 3 + 2] = p[2];
    }
    into.push(v);
  };
  const walk = (g) => {
    if (!g) return;
    if (g.type === "Polygon") for (const ring of g.coordinates) pushLine(ring);
    else if (g.type === "MultiPolygon") for (const poly of g.coordinates) for (const ring of poly) pushLine(ring);
    else if (g.type === "GeometryCollection") for (const sub of g.geometries) walk(sub);
  };
  walk(geometry);
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

const cache = new Map(); // ISO3 → array of sphere rings (cached, incl. empty)

/* Region border rings for one country (by ISO alpha-3), as sphere unit-vector
 * Float32Arrays. Resolves to [] when there's no ADM1 data or the network is
 * blocked, so callers can cache the result and never re-request. */
export async function regionRingsFor(iso3) {
  if (!iso3) return [];
  if (cache.has(iso3)) return cache.get(iso3);

  let rings = [];
  try {
    const metaRes = await fetch(API + iso3 + "/ADM1/");
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const url = meta && (meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL);
      if (url) {
        const fcRes = await fetch(cdnify(url));
        if (fcRes.ok) {
          const fc = await fcRes.json();
          for (const feat of fc.features || []) ringsFromGeometry(feat.geometry, rings);
        }
      }
    }
  } catch {
    rings = []; // network blocked / parse error → no regions, country still shown
  }

  cache.set(iso3, rings);
  return rings;
}
