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

## ✅ Phase 3 — Real data
Turns the demo into a product. The mocked sign-in is gone.
- ✅ **Real GitHub OAuth** (authorization-code) via a Vercel serverless function
  (`api/github-callback.js`) that holds the client secret and exchanges the
  code server-side — the access token never reaches the browser. Enabled by
  setting `VITE_GITHUB_CLIENT_ID` (build) + `GITHUB_CLIENT_ID` /
  `GITHUB_CLIENT_SECRET` (server); see `.env.example`.
- ✅ **Public-API fallback**: when OAuth isn't configured, the modal pulls a
  real public profile by username (no backend) so the feature works immediately.
- ✅ Real **profile / repos / top languages / stars** fetched from the GitHub API.
- ✅ **Geocoding** of the free-text `location` via Nominatim/OpenStreetMap, cached
  in `localStorage`; unlocated users still get a profile, just no pin.
- ✅ The signed-in user is pinned on the globe (distinct **magenta** marker)
  *on top of* the seeded fiction, and persists across reloads.
- ⬜ Shared, editable profiles for *other* real users → needs a datastore
  (today only the signed-in user is real; the rest stay seeded).
