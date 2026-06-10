/* DEVERSE — country label anchors for the vector globe.
 *
 * From the same bundled world-atlas (110m) geometry that draws the borders, we
 * derive, per country: a display name, a label anchor (the centroid of its
 * LARGEST landmass — so the USA label sits over the contiguous states, not in
 * the ocean next to Alaska), and a `size` in degrees (the bigger of the two
 * bounding-box dimensions of that landmass). The renderer uses `size` to scale
 * each label and to decide when it becomes legible: big countries read at a low
 * zoom, small ones only reveal their name as you zoom in. Exports COUNTRY_LABELS,
 * sorted largest-first so the important labels win any de-overlap pass. */
import * as topojson from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";

/* Shoelace area of a lon/lat ring (sign ignored — magnitude only). */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) / 2;
}

/* Area-weighted centroid of a lon/lat ring. */
function ringCentroid(ring) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    // degenerate ring → fall back to the plain mean of its vertices
    let mx = 0, my = 0;
    for (const p of ring) { mx += p[0]; my += p[1]; }
    return [mx / ring.length, my / ring.length];
  }
  a *= 3;
  return [cx / a, cy / a];
}

function bbox(ring) {
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/* A polygon may cross the antimeridian (Russia, Fiji): its lon range then spans
 * ~360° and both centroid and bbox are meaningless. Detect it and shift the
 * western lobe by +360 so the maths is continuous, wrapping the result back. */
function normalizeRing(ring) {
  const b = bbox(ring);
  if (b.maxX - b.minX <= 180) return ring;
  return ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]);
}

function wrapLon(lon) {
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}

function buildLabels() {
  let features = [];
  try {
    features = topojson.feature(worldAtlas, worldAtlas.objects.countries).features;
  } catch {
    return [];
  }

  const labels = [];
  for (const f of features) {
    const name = f.properties && f.properties.name;
    if (!name || !f.geometry) continue;

    // collect the outer ring of every polygon in this (Multi)Polygon
    const outers = [];
    if (f.geometry.type === "Polygon") {
      outers.push(f.geometry.coordinates[0]);
    } else if (f.geometry.type === "MultiPolygon") {
      for (const poly of f.geometry.coordinates) outers.push(poly[0]);
    }
    if (!outers.length) continue;

    // pick the largest landmass so the anchor sits on the mainland
    let best = null, bestArea = -1;
    for (const ring of outers) {
      const norm = normalizeRing(ring);
      const area = ringArea(norm);
      if (area > bestArea) { bestArea = area; best = norm; }
    }
    if (!best) continue;

    const [cxLon, cyLat] = ringCentroid(best);
    const b = bbox(best);
    const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    labels.push({ name, lon: wrapLon(cxLon), lat: cyLat, size });
  }

  labels.sort((a, b) => b.size - a.size);
  return labels;
}

export const COUNTRY_LABELS = buildLabels();
