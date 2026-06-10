import { describe, it, expect } from "vitest";
import { normalizeProfile, deriveFocus, buildDeveloper } from "../src/github.js";

describe("normalizeProfile", () => {
  const user = {
    login: "octocat",
    id: 583231,
    name: "The Octocat",
    avatar_url: "https://avatars.githubusercontent.com/u/583231",
    bio: "hi",
    html_url: "https://github.com/octocat",
    location: "San Francisco",
    created_at: "2011-01-25T18:44:36Z",
    public_repos: 8,
    followers: 100,
  };
  const repos = [
    { stargazers_count: 10, language: "Ruby", fork: false },
    { stargazers_count: 5, language: "Ruby", fork: false },
    { stargazers_count: 3, language: "JavaScript", fork: false },
    { stargazers_count: 999, language: "C", fork: true }, // forks are ignored
    { stargazers_count: 0, language: null, fork: false },
  ];

  it("sums stars over non-fork repos only", () => {
    expect(normalizeProfile(user, repos).stars).toBe(18);
  });

  it("ranks languages by repo count, ignoring forks and nulls", () => {
    expect(normalizeProfile(user, repos).langs).toEqual(["Ruby", "JavaScript"]);
  });

  it("carries identity fields through and falls back name→login", () => {
    const p = normalizeProfile({ login: "nobody", id: 1 }, []);
    expect(p.name).toBe("nobody");
    expect(p.html_url).toBe("https://github.com/nobody");
    expect(p.langs).toEqual([]);
    expect(p.stars).toBe(0);
  });
});

describe("deriveFocus", () => {
  it("maps known languages to a focus area", () => {
    expect(deriveFocus(["Rust"])).toBe("Systems");
    expect(deriveFocus(["TypeScript"])).toBe("Full-stack");
    expect(deriveFocus(["Python", "Go"])).toBe("Data / ML");
  });
  it("falls back sensibly", () => {
    expect(deriveFocus(["Brainfuck"])).toBe("Polyglot");
    expect(deriveFocus([])).toBe("Open source");
  });
});

describe("buildDeveloper", () => {
  it("produces a globe-ready developer with a real flag and offset id", async () => {
    // location empty → geocode returns null synchronously, no network
    const dev = await buildDeveloper(normalizeProfile({ login: "octocat", id: 583231 }, []));
    expect(dev.real).toBe(true);
    expect(dev.id).toBe(1_000_000 + 583231);
    expect(dev.handle).toBe("@octocat");
    expect(dev.lat).toBe(null);
    expect(dev.located).toBe(false);
    expect(dev.status).toBe("online");
    expect(Array.isArray(dev.connections)).toBe(true);
  });
});
