import { describe, it, expect } from "vitest";
import D from "../src/data.js";

describe("developer dataset", () => {
  const devs = D.developers;

  it("is non-empty and stable in shape", () => {
    expect(devs.length).toBeGreaterThan(100);
    expect(D.cities.length).toBe(52);
  });

  it("has unique, contiguous ids", () => {
    const ids = devs.map((d) => d.id);
    expect(new Set(ids).size).toBe(devs.length);
    expect(Math.min(...ids)).toBe(0);
    expect(Math.max(...ids)).toBe(devs.length - 1);
  });

  it("gives every developer the required fields", () => {
    for (const d of devs) {
      expect(typeof d.name).toBe("string");
      expect(d.handle.startsWith("@")).toBe(true);
      expect(Array.isArray(d.langs) && d.langs.length).toBeTruthy();
      expect(Number.isFinite(d.lat) && d.lat >= -90 && d.lat <= 90).toBe(true);
      expect(Number.isFinite(d.lon) && d.lon >= -180 && d.lon <= 180).toBe(true);
      expect(["online", "away", "offline"]).toContain(d.status);
    }
  });

  it("builds a valid connection graph (in range, no self-links)", () => {
    for (const d of devs) {
      expect(d.connections.length).toBeGreaterThan(0);
      for (const id of d.connections) {
        expect(Number.isInteger(id)).toBe(true);
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeLessThan(devs.length);
        expect(id).not.toBe(d.id);
      }
      expect(new Set(d.connections).size).toBe(d.connections.length); // no duplicates
    }
  });

  it("keeps language tallies consistent and sorted", () => {
    const total = devs.reduce((s, d) => s + d.langs.length, 0);
    const summed = Object.values(D.langCounts).reduce((a, b) => a + b, 0);
    expect(summed).toBe(total);
    // topLangs covers every counted language, in descending order
    expect(new Set(D.topLangs)).toEqual(new Set(Object.keys(D.langCounts)));
    for (let i = 1; i < D.topLangs.length; i++) {
      expect(D.langCounts[D.topLangs[i - 1]]).toBeGreaterThanOrEqual(D.langCounts[D.topLangs[i]]);
    }
  });

  it("keeps country tallies consistent", () => {
    const summed = Object.values(D.countryCounts).reduce((a, b) => a + b, 0);
    expect(summed).toBe(devs.length);
  });

  it("is deterministic across module evaluations", async () => {
    const again = (await import("../src/data.js")).default;
    expect(again.developers[0].name).toBe(devs[0].name);
    expect(again.developers.length).toBe(devs.length);
  });
});
