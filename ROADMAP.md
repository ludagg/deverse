# Roadmap — DEVERSE

Status of the work to "finish" the app. ✅ done · ⬜ open.

## ✅ Phase 0 — Stabilisation
- ✅ ESLint (flat config) + Prettier, with `lint` / `format` scripts.
- ✅ GitHub Actions CI: `lint` → `test` → `build` on every push/PR.
- ✅ MIT `LICENSE` + a *Contributing* section in the README.

## 🟠 Phase 1 — Ship it
- ✅ Favicon (pixel-art globe) + `theme-color`.
- ✅ SEO `description` and Open Graph / Twitter card meta in `index.html`.
- ⬜ **Vercel deploy** — the only step that needs a human: import `ludagg/deverse`
  at https://vercel.com/new (preset + `vercel.json` are ready). Every push then
  redeploys. CLI alternative: `npx vercel deploy --prod --token=…`.

## ✅ Phase 2 — UX polish
- ✅ Shareable URLs: search / stack / country / selected dev / online encoded in
  the query string and restored on load (a deep-linked dev recenters the globe);
  a "share" button copies the link.
- ✅ Mobile drawer: the left rail becomes a slide-in drawer below 720px.
- ✅ Accessibility: arrow-key browsing of developers, Escape to close, focusable
  globe, `role`/`aria-modal` on dialogs, aria-labels on icon controls.

## ✅ Phase 4 — Signature features
- ✅ Connection network: selecting a developer draws great-circle arcs to their
  (seeded) peers; connected pins are highlighted.
- ✅ "Online now" mode: a top-bar toggle filters the map to live developers.

## ✅ Phase 5 — Quality
- ✅ `src/projection.js` extracted and unit-tested (Vitest) — guards the
  mirror-orientation fix; dataset tests cover ids, the connection graph and the
  lang/country tallies. 13 tests, run in CI.
- ⬜ **Playwright e2e** (the screenshot script is a starting point).
- ⬜ **Performance**: the bundle embeds world-atlas 110m (~280 kB / ~100 kB
  gzip) — consider lazy-loading or a lighter outline mask.

## ⬜ Phase 3 — Real data (needs product decisions)
Turns the demo into a product. Open questions before starting:
- **Real GitHub OAuth** to replace the mocked flow → needs a registered OAuth
  app + a client secret, so a small backend or serverless function.
- Fetch real profile / repos / languages from the GitHub API.
- Geocode the developer's `location` to lat/lon.
- Persisted, editable profiles → backend vs. fully client-side?
