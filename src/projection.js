/* DEVERSE — shared sphere projection math.
 *
 * Extracted from the globe renderer so the orientation invariants — in
 * particular the "mirror fix" that makes EAST longitudes fall to the RIGHT of
 * the screen — are covered by unit tests (see test/projection.test.js).
 *
 * The country outlines in Globe.jsx (`strokeRings`) inline the same formula for
 * performance; keep the two in sync. */

export const DEG = Math.PI / 180;

/* lat/lon in degrees → unit vector on the sphere */
export function lonLatToVec(lat, lon) {
  const la = lat * DEG, lo = lon * DEG, cl = Math.cos(la);
  return [cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo)];
}

/* Rotate a unit vector by yaw (about the vertical axis) then pitch.
 * Returns rotated coords; `zz > 0` means the point is on the visible
 * hemisphere (facing the camera). */
export function project(x, y, z, yaw, pitch) {
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const xr = x * cosY + z * sinY;
  const zr = -x * sinY + z * cosY;
  const yr = y * cp - zr * sp;
  const zz = y * sp + zr * cp;
  return { xr, yr, zz };
}

/* Project a unit vector to screen pixels.
 * NOTE the minus sign on `xr`: that is the mirror fix — without it east and
 * west would be flipped. `R` is the on-screen sphere radius, (cx, cy) its
 * centre. */
export function worldToScreen(x, y, z, yaw, pitch, cx, cy, R) {
  const { xr, yr, zz } = project(x, y, z, yaw, pitch);
  return { sx: cx - R * xr, sy: cy - R * yr, zz };
}
