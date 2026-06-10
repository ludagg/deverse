/* DEVMAP — best-effort in-memory rate limiter.
 *
 * A fixed-window per-key counter that lives in the function instance's memory.
 * It throttles abusive bursts of the expensive endpoints (e.g. the OAuth
 * callback, which talks to GitHub + a geocoder + the DB) so one client can't
 * spam them into exhausting the database, third-party quotas or the serverless
 * budget.
 *
 * Caveat: serverless instances don't share memory, so this is a safety net per
 * instance, not a global guarantee. The platform edge (Vercel Firewall / WAF)
 * is the real volumetric-DDoS layer — see SECURITY.md. */
const buckets = new Map(); // key → { count, reset }

export function rateLimit(key, { limit = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const k = key || "unknown";
  let e = buckets.get(k);
  if (!e || now > e.reset) {
    e = { count: 0, reset: now + windowMs };
    buckets.set(k, e);
  }
  e.count++;

  // opportunistic cleanup so the map can't grow without bound under a flood
  if (buckets.size > 10_000) {
    for (const [bk, bv] of buckets) if (now > bv.reset) buckets.delete(bk);
  }

  const ok = e.count <= limit;
  return { ok, remaining: Math.max(0, limit - e.count), retryAfter: Math.ceil((e.reset - now) / 1000) };
}
