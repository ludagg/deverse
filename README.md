# DEVMAP — World Map of Developers

A retro pixel-art / CRT world map of the global developer community. Implemented
from a Claude Design handoff bundle as a real **Vite + React** app.

![DEVMAP — vector globe with real country outlines and the developer UI](docs/screenshots/hero.png)

## Screenshots

| Developer profile | Sign in with GitHub |
| --- | --- |
| ![Selecting a developer filtered by stack, with the globe recentered and a profile card open](docs/screenshots/profile.png) | ![GitHub-only sign-up modal](docs/screenshots/github-signin.png) |

## What's here

- **3D vector globe** rendered to canvas with **real country outlines** (neon-green
  borders on a dark sphere). Borders come from bundled `world-atlas` (110m) geometry
  projected onto the sphere with back-face culling — no network call at runtime.
- **Real developers from a database** (Postgres) — populated from GitHub by city,
  each with stack, focus, experience, repos, stars, followers and avatar. Falls
  back to a 327-strong seeded fiction dataset when no DB is configured. See
  [Database & real developers](#database--real-developers).
- **Seniority rating (★1–5)** computed from each developer's metrics, shown in the
  profile and on every result row, so a senior reads differently from a junior.
- **Connection network** — selecting a developer draws great-circle arcs to peers
  sharing their stack, and an **"online now"** toggle filters to live developers.
- **Cyan pulsing pins** — hover for a tooltip, click to recenter the globe and open
  a detailed profile card.
- **Search** (devs / cities / stacks) and **stack filters** that produce a tappable
  **results list**, plus a clickable **by-country** list. Mobile-friendly drawer.
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
| `src/data.js` | Seeded fiction dataset — the fallback when the DB is empty/unset |
| `src/github.js` | Real GitHub integration: OAuth, public-API fetch, geocoding, rating |
| `src/derive.js` | Tallies (langs/countries) + peer graph derived from any dev list |
| `api/developers.js` | `GET /api/developers` — the map data, read from Postgres |
| `api/github-callback.js` | Serverless OAuth: token exchange, geocode, upsert to the DB |
| `api/_db.js` / `api/_geo.js` | Postgres access layer / server-side Nominatim geocoding |
| `scripts/seed-devs.js` | `npm run seed` — populate the DB with real GitHub developers |
| `db/schema.sql` | Database schema (run once in your provider's SQL editor) |
| `src/geo.js` | Builds country-outline line rings from bundled world-atlas |
| `src/projection.js` | Shared sphere projection math (unit-tested) |
| `src/Globe.jsx` | Canvas vector-globe engine (projection, pins, arcs, interaction) |
| `src/App.jsx` | UI: top bar, GitHub auth, search, filters, profile panel |
| `src/styles.css` | Retro pixel-art / CRT visual system |

## GitHub sign-in

DEVMAP pulls **real** GitHub data. There are two modes:

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
[Nominatim/OpenStreetMap](https://nominatim.org/) and the developer is pinned on
the globe. `npm run dev` runs the serverless functions locally through a small
Vite middleware, so OAuth works end-to-end on localhost.

## Database & real developers

The map is backed by **Postgres** (Supabase / Neon / Vercel Postgres — any
standard Postgres works). Without a database the app still runs: `GET
/api/developers` returns nothing and the front falls back to the bundled fiction.

1. **Create a database** and run [`db/schema.sql`](db/schema.sql) in its SQL
   editor (Supabase → *SQL Editor → New query*).
2. **Set `DATABASE_URL`** (the *pooled* connection string) in `.env` for local
   dev and in Vercel's env vars for production. See [`.env.example`](.env.example).
3. **Seed real developers** — with a read-only GitHub token:
   ```bash
   GITHUB_TOKEN=ghp_xxx DATABASE_URL=postgres://… npm run seed
   ```
   For each city it pulls the most-followed GitHub users located there, with
   their repos, languages, stars and followers. The city/coordinates come from
   the app's own table (the search is *by* city), so the map location is always
   correct. Re-run any time to refresh the metrics.

Once a database is configured, **OAuth sign-ins are persisted and shared**: when
someone signs in they're upserted into the DB and appear on *everyone's* map
(with their real geocoded location), not just their own browser. The signed-in
user is highlighted with a distinct **magenta** marker.

## Contributing

Contributions are welcome.

1. Fork the repo and create a feature branch.
2. `npm install`, then make your change.
3. Make sure `npm run lint` and `npm run build` both pass (CI runs them on every
   push and PR).
4. Run `npm run format` to keep the style consistent.
5. Open a pull request describing the change.

## License

[MIT](LICENSE) © DEVMAP
