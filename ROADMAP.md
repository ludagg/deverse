# Roadmap — DEVERSE

Next steps, by priority.

## 🔴 Immediate — finish the Vercel deployment

The only blocked item: Vercel needs authentication.

- **Token**: create one at https://vercel.com/account/tokens, then deploy with
  `vercel deploy --prod`.
- **Dashboard (recommended, continuous deploys)**: https://vercel.com/new →
  import `ludagg/deverse` → Deploy. Every `git push` then redeploys automatically
  (`vercel.json` is already in place).

## 🟠 Short term — repo polish

- **License** (MIT?) + a "Contributing" section in the README.
- **GitHub Actions CI**: `npm ci && npm run build` on every push/PR as a
  regression guard.
- **Favicon + Open Graph meta** (share image = the hero shot) for a clean preview
  when the deployed link is shared.
- **`<meta description>` / `og:` tags** in `index.html`.

## 🟡 Medium term — features

- **Connection network** between developers (lines/arcs across the globe).
- **"Who's online now" mode** (filter by `online` status).
- **Real data**: replace the fictional dataset with the GitHub API (the sign-in
  button becomes a real OAuth flow) → real, geolocated developers.
- **Shareable state URLs** (dev/country/filter encoded in the URL for deep links).
- **Accessibility & mobile**: keyboard navigation of pins; the rail is hidden
  below 720px, so add a mobile drawer.

## 🟢 Long term — robustness & quality

- **Tests**: unit tests for the projection (guard the mirror-orientation fix) and
  the data generator; Playwright e2e (the screenshot script is a starting point).
- **Performance**: the bundle is ~280 kB (98 kB gzip) because world-atlas 110m is
  embedded — consider lazy-loading or a lighter outline mask.
- **Lightweight backend** (persisted developers, editable profiles) if this grows
  into a real product.
