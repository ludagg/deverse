import { describe, it, expect } from "vitest";
import { lonLatToVec, project, worldToScreen } from "../src/projection.js";

const mag = (v) => Math.hypot(v[0], v[1], v[2]);

describe("lonLatToVec", () => {
  it("returns unit vectors", () => {
    for (const [lat, lon] of [[0, 0], [37.77, -122.42], [-33.87, 151.21], [90, 0]]) {
      expect(mag(lonLatToVec(lat, lon))).toBeCloseTo(1, 6);
    }
  });

  it("maps lon/lat 0,0 and the poles to the expected axes", () => {
    expect(lonLatToVec(0, 0)).toEqual([expect.closeTo(1, 6), expect.closeTo(0, 6), expect.closeTo(0, 6)]);
    expect(lonLatToVec(90, 0)[1]).toBeCloseTo(1, 6); // north pole → +y
    expect(lonLatToVec(-90, 0)[1]).toBeCloseTo(-1, 6); // south pole → -y
  });
});

describe("project — visibility", () => {
  it("flags the back hemisphere as hidden (zz <= 0)", () => {
    // With yaw=0,pitch=0 the camera looks down +z; lon=+90 faces it, lon=-90 is behind.
    const front = lonLatToVec(0, 90);
    const back = lonLatToVec(0, -90);
    expect(project(...front, 0, 0).zz).toBeGreaterThan(0);
    expect(project(...back, 0, 0).zz).toBeLessThan(0);
  });
});

describe("worldToScreen — mirror-orientation fix", () => {
  const cx = 500, cy = 500, R = 400;

  it("places EAST longitudes to the RIGHT and WEST to the LEFT", () => {
    // Front-centre is lon=90 (yaw=0). Just-east (100) must land right of just-west (80).
    const east = worldToScreen(...lonLatToVec(0, 100), 0, 0, cx, cy, R);
    const west = worldToScreen(...lonLatToVec(0, 80), 0, 0, cx, cy, R);
    expect(east.zz).toBeGreaterThan(0);
    expect(west.zz).toBeGreaterThan(0);
    expect(east.sx).toBeGreaterThan(cx);
    expect(west.sx).toBeLessThan(cx);
    expect(east.sx).toBeGreaterThan(west.sx);
  });

  it("places the north pole above the centre", () => {
    const north = worldToScreen(...lonLatToVec(90, 0), 0, 0, cx, cy, R);
    expect(north.sy).toBeLessThan(cy); // smaller y = higher on screen
  });

  it("is unaffected horizontally by a longitude on the central meridian under pitch", () => {
    // A point on the viewing meridian stays horizontally centred regardless of pitch.
    const p = worldToScreen(...lonLatToVec(20, 90), 0, 0.3, cx, cy, R);
    expect(p.sx).toBeCloseTo(cx, 6);
  });
});
