import { describe, it, expect } from "vitest";
import { COUNTRY_LABELS } from "../src/labels.js";

const byName = (n) => COUNTRY_LABELS.find((c) => c.name === n);

describe("COUNTRY_LABELS", () => {
  it("derives a label per country with sane fields", () => {
    expect(COUNTRY_LABELS.length).toBeGreaterThan(150);
    for (const c of COUNTRY_LABELS) {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.lon).toBeGreaterThanOrEqual(-180);
      expect(c.lon).toBeLessThanOrEqual(180);
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.size).toBeGreaterThan(0);
    }
  });

  it("is sorted largest-first so big countries win the de-overlap pass", () => {
    for (let i = 1; i < COUNTRY_LABELS.length; i++) {
      expect(COUNTRY_LABELS[i - 1].size).toBeGreaterThanOrEqual(COUNTRY_LABELS[i].size);
    }
  });

  it("anchors the USA label over the contiguous states, not beside Alaska", () => {
    const us = byName("United States of America");
    expect(us).toBeTruthy();
    expect(us.lon).toBeGreaterThan(-110);
    expect(us.lon).toBeLessThan(-85);
    expect(us.lat).toBeGreaterThan(30);
    expect(us.lat).toBeLessThan(50);
  });

  it("attaches the ISO alpha-3 code used to fetch a country's regions", () => {
    expect(byName("France").iso3).toBe("FRA");
    expect(byName("United States of America").iso3).toBe("USA");
    expect(byName("Japan").iso3).toBe("JPN");
    expect(byName("Brazil").iso3).toBe("BRA");
  });

  it("keeps an antimeridian-spanning country's anchor on real land", () => {
    const ru = byName("Russia");
    expect(ru).toBeTruthy();
    expect(ru.lat).toBeGreaterThan(45); // Siberia, not flung to a pole/ocean
    expect(ru.lat).toBeLessThan(75);
  });
});
