/* DEVERSE — tallies and relationships derived from a developer list, so the
 * UI works the same whether the data is the bundled fiction or rows from the
 * database. */

/* Language and country counts (+ languages sorted by frequency). */
export function tallies(developers) {
  const langCounts = {};
  const countryCounts = {};
  for (const d of developers) {
    for (const l of d.langs || []) langCounts[l] = (langCounts[l] || 0) + 1;
    if (d.country) countryCounts[d.country] = (countryCounts[d.country] || 0) + 1;
  }
  const topLangs = Object.keys(langCounts).sort((a, b) => langCounts[b] - langCounts[a]);
  return { langCounts, topLangs, countryCounts };
}

/* The selected developer's "network" for the connection arcs. Uses a seeded
 * graph when present (the fiction has one); otherwise derives peers on the fly
 * as the highest-impact developers sharing a language. */
export function peersOf(dev, all, max = 5) {
  if (!dev) return null;
  if (dev.connections && dev.connections.length) return new Set(dev.connections);
  const langs = new Set(dev.langs || []);
  if (!langs.size) return new Set();
  const peers = all
    .filter((o) => o.id !== dev.id && o.lat != null && (o.langs || []).some((l) => langs.has(l)))
    .sort((a, b) => (b.stars || 0) - (a.stars || 0))
    .slice(0, max);
  return new Set(peers.map((o) => o.id));
}
