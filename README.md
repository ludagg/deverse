# DEVERSE — World Map of Developers

A retro pixel-art / CRT world map of the global developer community. Implemented
from a Claude Design handoff bundle as a real **Vite + React** app.

![DEVERSE — vector globe with real country outlines and the developer UI](docs/screenshots/hero.png)

## Screenshots

| Developer profile | Sign in with GitHub |
| --- | --- |
| ![Selecting a developer filtered by stack, with the globe recentered and a profile card open](docs/screenshots/profile.png) | ![GitHub-only sign-up modal](docs/screenshots/github-signin.png) |

## What's here

- **3D vector globe** rendered to canvas with **real country outlines** (neon-green
  borders on a dark sphere). Borders come from bundled `world-atlas` (110m) geometry
  projected onto the sphere with back-face culling — no network call at runtime.
- **327 seeded fictional developers** across 52 real cities, each with stack, focus,
  experience, repos, stars, status, and a generated pixel-art identicon.
- **Connection network** — selecting a developer draws great-circle arcs to their
  peers, and an **"online now"** toggle filters the map to live developers.
- **Pulsing pins** — hover for a tooltip, click to recenter the globe and open a
  detailed profile card.
- **Search** (devs / cities / stacks; `Enter` selects the first match), **stack
  filters** (non-matching pins dim), and a clickable **by-country** list.
- **Sign in with GitHub (real data)** — real OAuth via a serverless function, or
  a public-API-by-username fallback. Your actual profile, repos, top languages
  and stars are pulled from GitHub, your `location` is geocoded, and you're
  pinned on the globe with a distinct **magenta** marker. See
  [GitHub sign-in](#github-sign-in).
- Full CRT chrome: scanlines, vignette, grain, flicker, boot screen, and the
  Press Start 2P + VT323 fonts.

## Run it

```bash
npm install
npm run dev          # start the dev server
npm run build        # production build → dist/
npm run preview      # serve the production build
npm run lint         # ESLint
npm test             # Vitest (projection + dataset unit tests)
npm run format       # Prettier (write)
```

## Structure

| File | Role |
| --- | --- |
| `src/data.js` | Seeded developer dataset (stable across reloads) |
| `src/github.js` | Real GitHub integration: OAuth, public-API fetch, geocoding |
| `api/github-callback.js` | Serverless OAuth token exchange (Vercel; secret stays server-side) |
| `src/geo.js` | Builds country-outline line rings from bundled world-atlas |
| `src/projection.js` | Shared sphere projection math (unit-tested) |
| `src/Globe.jsx` | Canvas vector-globe engine (projection, pins, arcs, interaction) |
| `src/App.jsx` | UI: top bar, GitHub auth, search, filters, profile panel |
| `src/styles.css` | Retro pixel-art / CRT visual system |

## GitHub sign-in

DEVERSE pulls **real** GitHub data. There are two modes:

- **OAuth (recommended for production).** Create a GitHub OAuth App at
  <https://github.com/settings/developers> → *New OAuth App*, with the
  *Authorization callback URL* set to your origin (e.g. `http://localhost:5173/`
  for dev, `https://<your-app>.vercel.app/` for prod). Then set the variables
  from [`.env.example`](.env.example):
  - `VITE_GITHUB_CLIENT_ID` — public, baked into the build; switches the button
    to the real OAuth redirect.
  - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — server-only, read by the
    serverless function `api/github-callback.js`, which exchanges the OAuth code
    for a token. **The token never reaches the browser.**

  On Vercel, add the same three variables under *Project → Settings →
  Environment Variables*. The `/api` function is detected automatically.

- **Public-API fallback (zero config).** With no `VITE_GITHUB_CLIENT_ID`, the
  sign-in modal asks for a username and fetches that account's *public* profile,
  repos and languages directly from `api.github.com` — no backend, no secret
  (rate-limited to 60 requests/hour per IP).

Either way, the free-text `location` is geocoded via
[Nominatim/OpenStreetMap](https://nominatim.org/) (cached in `localStorage`) and
the developer is pinned on the globe. `npm run dev` runs the serverless function
locally through a small Vite middleware, so OAuth works end-to-end on localhost.

## Contributing

Contributions are welcome.

1. Fork the repo and create a feature branch.
2. `npm install`, then make your change.
3. Make sure `npm run lint` and `npm run build` both pass (CI runs them on every
   push and PR).
4. Run `npm run format` to keep the style consistent.
5. Open a pull request describing the change.

## License

[MIT](LICENSE) © DEVERSE
