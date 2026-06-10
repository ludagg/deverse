/* DEVMAP — real country outlines for the vector globe.
   Converts bundled world-atlas (110m) borders into sphere-ready line rings
   (unit vectors). The geometry is imported at build time, so the outlines are
   available synchronously with no network call. Falls back to a coarse traced
   silhouette only if the topojson mesh fails. Exports GEO_RINGS. */
import * as topojson from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";

const DEG = Math.PI / 180;

function vec(lon, lat) {
  const la = lat * DEG, lo = lon * DEG, cl = Math.cos(la);
  return [cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo)];
}

// Subdivide long segments so the line hugs the sphere instead of cutting chords.
function densify(line, maxDeg) {
  const out = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    out.push(a);
    let dl = b[0] - a[0];
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360; // antimeridian guard
    const dlat = b[1] - a[1];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dl), Math.abs(dlat)) / maxDeg));
    for (let s = 1; s < steps; s++) {
      out.push([a[0] + (dl * s) / steps, a[1] + (dlat * s) / steps]);
    }
  }
  out.push(line[line.length - 1]);
  return out;
}

function buildFromLines(lines) {
  const rings = [];
  for (const raw of lines) {
    if (!raw || raw.length < 2) continue;
    const ln = densify(raw, 4);
    const v = new Float32Array(ln.length * 3);
    for (let i = 0; i < ln.length; i++) {
      const p = vec(ln[i][0], ln[i][1]);
      v[i * 3] = p[0]; v[i * 3 + 1] = p[1]; v[i * 3 + 2] = p[2];
    }
    rings.push(v);
  }
  return rings;
}

// ---- coarse fallback silhouettes (used only if the mesh build fails) ----
const FALLBACK = [
  [[-168,65],[-158,71],[-128,71],[-100,74],[-80,73],[-62,61],[-55,50],[-67,45],[-70,41],[-76,35],[-81,25],[-90,29],[-97,26],[-97,18],[-104,20],[-117,32],[-124,40],[-124,49],[-135,56],[-150,59],[-165,60],[-168,65]],
  [[-78,8],[-70,11],[-60,10],[-50,2],[-35,-5],[-38,-13],[-41,-22],[-48,-26],[-58,-39],[-66,-50],[-72,-53],[-74,-44],[-72,-30],[-70,-18],[-76,-14],[-81,-5],[-80,2],[-78,8]],
  [[-16,14],[-12,28],[-2,35],[10,37],[18,32.5],[25,32],[33,31],[35,24],[43,11],[51,12],[42,-2],[40,-12],[33,-26],[25,-34],[18,-34],[13,-23],[9,-2],[2,5],[-8,4],[-15,10],[-16,14]],
  [[-10,37],[-9,44],[-4,48],[2,51],[7,54],[6,58],[10,63],[18,69],[28,71],[40,68],[44,60],[40,52],[34,46],[28,41],[22,40],[14,40],[8,44],[0,43],[-9,40],[-10,37]],
  [[44,60],[55,68],[70,73],[100,76],[140,73],[178,68],[170,60],[160,58],[150,46],[123,40],[122,30],[109,21],[105,9],[100,6],[98,16],[90,22],[82,18],[77,8],[72,20],[66,24],[57,24],[48,30],[44,40],[44,52],[44,60]],
  [[113,-22],[114,-30],[121,-34],[129,-32],[138,-35],[141,-38],[150,-38],[154,-32],[153,-25],[146,-18],[139,-12],[135,-13],[130,-12],[123,-16],[113,-22]],
  [[-45,60],[-22,65],[-18,73],[-28,81],[-45,83],[-55,79],[-50,68],[-45,60]],
];

function buildRings() {
  try {
    const mesh = topojson.mesh(worldAtlas, worldAtlas.objects.countries);
    const rings = buildFromLines(mesh.coordinates);
    if (rings.length) return rings;
    throw new Error("empty mesh");
  } catch (e) {
    console.warn("[geo] atlas mesh unavailable, using fallback:", e.message);
    return buildFromLines(FALLBACK);
  }
}

export const GEO_RINGS = buildRings();
