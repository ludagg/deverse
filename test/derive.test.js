import { describe, it, expect } from "vitest";
import { tallies, peersOf } from "../src/derive.js";

const devs = [
  { id: 1, country: "France", langs: ["Rust", "Go"], lat: 48, lon: 2, stars: 100 },
  { id: 2, country: "France", langs: ["Rust"], lat: 43, lon: 5, stars: 50 },
  { id: 3, country: "Japan", langs: ["Go", "Python"], lat: 35, lon: 139, stars: 10 },
  { id: 4, country: "", langs: [], lat: null, lon: null, stars: 0 },
];

describe("tallies", () => {
  it("counts languages and countries, ignoring blanks", () => {
    const t = tallies(devs);
    expect(t.langCounts).toEqual({ Rust: 2, Go: 2, Python: 1 });
    expect(t.countryCounts).toEqual({ France: 2, Japan: 1 });
    expect(t.topLangs[0] === "Rust" || t.topLangs[0] === "Go").toBe(true);
  });
});

describe("peersOf", () => {
  it("uses a seeded connection graph when present", () => {
    const set = peersOf({ id: 1, langs: ["Rust"], connections: [2, 3] }, devs);
    expect([...set].sort()).toEqual([2, 3]);
  });
  it("derives located, language-sharing peers when there is no graph", () => {
    const set = peersOf(devs[0], devs); // shares Rust with 2, Go with 3
    expect(set.has(2)).toBe(true);
    expect(set.has(3)).toBe(true);
    expect(set.has(4)).toBe(false); // unlocated / no shared lang
    expect(set.has(1)).toBe(false); // not self
  });
  it("returns null for no selection", () => {
    expect(peersOf(null, devs)).toBe(null);
  });
});
