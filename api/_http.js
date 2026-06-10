/* DEVMAP — fetch with a hard timeout.
 *
 * Every outbound call from a serverless function (GitHub, Nominatim, IP geo,
 * region CDN…) goes through here so a slow or hanging upstream can't pin a
 * function open. Without this, enough stuck requests would exhaust the
 * concurrency budget and take the whole API down — exactly the failure mode we
 * want to avoid. AbortSignal.timeout aborts the request after `ms`. */
export async function fetchT(url, opts = {}, ms = 6000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}
