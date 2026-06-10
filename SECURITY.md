# Security & resilience

DEVMAP is built to stay up under abusive traffic. No web app is literally
impossible to take down — true volumetric (L3/L4/L7) DDoS protection lives at
the network edge, not in application code — so this is **defence in depth**:
the app hardens what it controls, and the platform provides the edge shield.

## How a request is served (and why that's resilient)

- **Static front-end on the CDN edge.** The HTML/JS/CSS and assets are served
  from Vercel's edge, content-hashed and cached. A traffic spike hits the CDN,
  not an origin server, which is the single biggest reason the site stays up.
- **`GET /api/developers`** is cached three ways: a long edge cache
  (`s-maxage=300, stale-while-revalidate=3600`), a per-instance in-memory copy
  (60 s), and graceful degradation that serves the last good payload — or lets
  the front fall back to the bundled dataset — if the database is slow. A read
  spike is absorbed by caches and almost never reaches Postgres.

## In-code protections

- **Time-boxed upstreams.** Every outbound call (GitHub, Nominatim, IP geo,
  region CDN, and the DB query) has a hard timeout (`api/_http.js`,
  `Promise.race`). A hanging dependency can't pin functions open and exhaust
  the concurrency budget — the classic way an API "falls over".
- **Per-IP rate limiting** (`api/_limit.js`) on the expensive paths: the OAuth
  callback (12/min) and the developers read (120/min). This is *best-effort*:
  serverless instances don't share memory, so it throttles per-instance bursts
  but is **not** a global limiter — that's the edge's job (below).
- **Input hardening on the OAuth callback:** request body capped at 8 KB, the
  authorization `code` validated against a strict charset/length, `redirect_uri`
  length-bounded (GitHub validates it against the OAuth app too). A sign-in
  never fails the whole request on a DB hiccup.
- **No secrets in the browser.** The GitHub client secret and `DATABASE_URL`
  are server-only; the access token is exchanged server-side and never sent to
  the client.
- **Security headers** (`vercel.json`) on every response: a strict
  Content-Security-Policy, HSTS (preload), `nosniff`, `X-Frame-Options: DENY` /
  `frame-ancestors 'none'` (clickjacking), `Referrer-Policy`,
  `Permissions-Policy` (geolocation/camera/mic/etc. disabled), and
  `Cross-Origin-Opener-Policy`.

## Platform configuration — required for real DDoS resilience

These are **not** code; enable them in the dashboards:

1. **Vercel Firewall / WAF** (Project → Firewall): turn on managed rulesets and,
   if attacked, **Attack Challenge Mode**. Add custom **rate-limit rules** on
   `/api/*` for a true global limit (the in-code limiter is only a backstop).
2. **Optional Cloudflare** in front of the domain for an extra volumetric layer
   (proxied DNS, "Under Attack" mode).
3. **Supabase**: use the **Transaction pooler** connection string (already
   assumed by `api/_db.js`, `prepare:false`, `max:1`) so a flood of function
   instances can't exhaust Postgres connections; keep **RLS** enabled (the
   functions use a direct connection and aren't affected, but the public API
   keys stay safe).
4. Keep all secrets in **Environment Variables**, never in the repo.

## Maintenance note — CSP script hash

The CSP pins the inline JSON-LD block by its SHA-256 hash. If you edit that
`<script type="application/ld+json">` in `index.html`, regenerate the hash and
update `vercel.json`:

```bash
npm run build
node -e "const fs=require('fs'),c=require('crypto');const m=fs.readFileSync('dist/index.html','utf8').match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/);console.log('sha256-'+c.createHash('sha256').update(m[1]).digest('base64'))"
```

## Reporting a vulnerability

Please open a private report via GitHub Security Advisories on the repository,
or contact the maintainer. Avoid filing public issues for security reports.
