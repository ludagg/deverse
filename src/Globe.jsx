/* DEVERSE — vector country-outline globe (canvas, hi-res). */
import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import { GEO_RINGS } from "./geo.js";
import { COUNTRY_LABELS } from "./labels.js";
import { regionRingsFor } from "./regions.js";
import { lonLatToVec, project, worldToScreen } from "./projection.js";

const DEG = Math.PI / 180;

// Zoom envelope. The ceiling is high enough to dive into a single country (a
// developer focus only nudges to FOCUS_ZOOM); past DEEP_ZOOM the centred
// country reveals its admin-1 regions, loaded on demand.
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 9;
const FOCUS_ZOOM = 2.7;
const DEEP_ZOOM = 3.4;

const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/* Pick the rotation-equivalent of `target` nearest `current` so the globe takes
 * the short way round instead of unwinding a near-full turn. */
function nearestAngle(target, current) {
  let d = target - current;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return current + d;
}

/* Yaw that brings longitude `lon` to the front-centre of the view. The renderer
 * centres lon = yaw + 90°, so the camera-facing meridian is (lon − 90)°. */
const centerYaw = (lon) => (lon - 90) * DEG;

/* Tidy a couple of long atlas names so labels read like a printed map. */
function labelText(name) {
  if (name === "United States of America") return "UNITED STATES";
  if (name === "Dem. Rep. Congo") return "DR CONGO";
  return name.toUpperCase();
}

/* Latitude/longitude graticule as line rings of unit vectors (Float32Array). */
function buildGraticule() {
  const rings = [];
  const mk = (pts) => {
    const v = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const lo = pts[i][0] * DEG, la = pts[i][1] * DEG, cl = Math.cos(la);
      v[i * 3] = cl * Math.cos(lo); v[i * 3 + 1] = Math.sin(la); v[i * 3 + 2] = cl * Math.sin(lo);
    }
    rings.push(v);
  };
  for (let lon = -180; lon < 180; lon += 30) {
    const a = []; for (let lat = -80; lat <= 80; lat += 4) a.push([lon, lat]); mk(a);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const a = []; for (let lon = -180; lon <= 180; lon += 4) a.push([lon, lat]); mk(a);
  }
  return rings;
}

const Globe = forwardRef(function Globe(props, ref) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const gratRef = useRef(null);
  const stateRef = useRef({
    yaw: -1.9, pitch: 0.32, zoom: 1, tZoom: 1,
    tYaw: -1.9, tPitch: 0.32, focusing: false,
    dragging: false, moved: 0, lastX: 0, lastY: 0,
    res: 2, bw: 0, bh: 0,
    pins: [], t: 0,
    labels: [],                    // drawn country-label boxes, for click-to-open
    regionRings: new Map(),        // ISO3 → admin-1 sphere rings (lazy, CDN)
  });
  const propsRef = useRef(props);
  propsRef.current = props;
  const [tip, setTip] = useState(null);

  if (!gratRef.current) gratRef.current = buildGraticule();

  useImperativeHandle(ref, () => ({
    zoomBy: (f) => { const s = stateRef.current; s.tZoom = clampZoom(s.tZoom * f); },
    reset: () => {
      const s = stateRef.current;
      s.tYaw = nearestAngle(-1.9, s.yaw); s.tPitch = 0.32; s.tZoom = 1; s.focusing = true;
    },
    focusLatLon: (lat, lon, zoom) => {
      const s = stateRef.current;
      s.tYaw = nearestAngle(centerYaw(lon), s.yaw);
      s.tPitch = Math.max(-1.0, Math.min(1.0, lat * DEG));
      s.tZoom = clampZoom(zoom != null ? zoom : Math.max(s.tZoom, FOCUS_ZOOM));
      s.focusing = true;
    },
  }));

  useEffect(() => {
    if (!props.focusTarget) return;
    const s = stateRef.current;
    s.tYaw = nearestAngle(centerYaw(props.focusTarget.lon), s.yaw);
    s.tPitch = Math.max(-1.0, Math.min(1.0, props.focusTarget.lat * DEG));
    s.tZoom = clampZoom(Math.max(s.tZoom, FOCUS_ZOOM));
    s.focusing = true;
  }, [props.focusTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const s = stateRef.current;
    const graticule = gratRef.current;
    let raf;

    function resize() {
      const r = wrapRef.current.getBoundingClientRect();
      s.res = Math.min(2, window.devicePixelRatio || 1);
      s.bw = Math.max(2, Math.round(r.width * s.res));
      s.bh = Math.max(2, Math.round(r.height * s.res));
      canvas.width = s.bw; canvas.height = s.bh;
      ctx.imageSmoothingEnabled = true;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current);

    const Lv = (() => { const v = [-0.32, 0.42, 0.85]; const m = Math.hypot(...v); return [v[0] / m, v[1] / m, v[2] / m]; })();

    // Draw an array of line rings (Float32Array of unit vectors), back-face culled.
    // The screen-x term subtracts xr so east longitudes fall to the right (mirror fix).
    function strokeRings(rings, cx, cy, R, cosY, sinY, cp, sp) {
      if (!rings) return;
      ctx.beginPath();
      for (let r = 0; r < rings.length; r++) {
        const v = rings[r];
        let pen = false;
        for (let i = 0; i < v.length; i += 3) {
          const x = v[i], y = v[i + 1], z = v[i + 2];
          const xr = x * cosY + z * sinY;
          const zr = -x * sinY + z * cosY;
          const yr = y * cp - zr * sp;
          const zz = y * sp + zr * cp;
          if (zz <= 0.02) { pen = false; continue; }
          const sx = cx - R * xr, sy = cy - R * yr;
          if (!pen) { ctx.moveTo(sx, sy); pen = true; } else { ctx.lineTo(sx, sy); }
        }
      }
    }

    function frame() {
      const P = propsRef.current;
      s.t += 1;

      if (s.focusing) {
        s.yaw += (s.tYaw - s.yaw) * 0.11;
        s.pitch += (s.tPitch - s.pitch) * 0.11;
        if (Math.abs(s.tYaw - s.yaw) < 0.003 && Math.abs(s.tPitch - s.pitch) < 0.003) s.focusing = false;
      } else if (P.autoToggle && !s.dragging && !P.selectedId && s.zoom < 1.4) {
        s.yaw -= 0.0019;
      }
      // ease zoom toward its target so wheel, buttons and focus all glide
      s.zoom += (s.tZoom - s.zoom) * 0.16;

      const bw = s.bw, bh = s.bh, res = s.res;
      const cx = bw / 2, cy = bh / 2;
      const R = Math.min(bw, bh) * 0.46 * Math.max(s.zoom, MIN_ZOOM);
      const cosY = Math.cos(s.yaw), sinY = Math.sin(s.yaw);
      const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);

      ctx.clearRect(0, 0, bw, bh);

      // base sphere (ocean body) shaded toward the light direction
      const body = ctx.createRadialGradient(
        cx + R * Lv[0] * 0.5, cy - R * Lv[1] * 0.5, R * 0.1,
        cx, cy, R * 1.02);
      body.addColorStop(0, "#0e2a2b");
      body.addColorStop(0.55, "#0a1c1f");
      body.addColorStop(1, "#040c0f");
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();

      // atmosphere glow
      const halo = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.2);
      halo.addColorStop(0, "rgba(45,212,191,0.16)");
      halo.addColorStop(1, "rgba(45,212,191,0)");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, 7); ctx.fill();

      // clip everything else to the sphere
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.002, 0, 7); ctx.clip();
      ctx.lineJoin = "round"; ctx.lineCap = "round";

      // faint graticule grid
      strokeRings(graticule, cx, cy, R, cosY, sinY, cp, sp);
      ctx.lineWidth = Math.max(0.6, 0.7 * res);
      ctx.strokeStyle = "rgba(45,212,191,0.07)";
      ctx.stroke();

      // real country outlines — neon glow pass, then crisp pass
      const geoRings = GEO_RINGS;
      if (geoRings) {
        strokeRings(geoRings, cx, cy, R, cosY, sinY, cp, sp);
        ctx.lineWidth = Math.max(2.4, 2.4 * res);
        ctx.strokeStyle = "rgba(57,211,83,0.13)";
        ctx.stroke();
        ctx.lineWidth = Math.max(1, 1.05 * res);
        ctx.strokeStyle = "rgba(74,224,110,0.6)";
        ctx.stroke();
      }

      // --- deep zoom: the country under the centre reveals its admin-1 regions
      let active = null; // the centred country's label object
      if (s.zoom > DEEP_ZOOM) {
        let bestD = Infinity;
        for (const c of COUNTRY_LABELS) {
          const v = lonLatToVec(c.lat, c.lon);
          const { sx, sy, zz } = worldToScreen(v[0], v[1], v[2], s.yaw, s.pitch, cx, cy, R);
          if (zz <= 0.35) continue;
          const dd = (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy);
          if (dd < bestD) { bestD = dd; active = c; }
        }
      }
      const iso3 = active && active.iso3;
      if (iso3 && !s.regionRings.has(iso3)) {
        s.regionRings.set(iso3, null); // pending — avoids re-fetching every frame
        regionRingsFor(iso3)
          .then((r) => s.regionRings.set(iso3, r || []))
          .catch(() => s.regionRings.set(iso3, []));
      }
      if (iso3) {
        const rr = s.regionRings.get(iso3);
        if (Array.isArray(rr) && rr.length) {
          strokeRings(rr, cx, cy, R, cosY, sinY, cp, sp);
          ctx.lineWidth = Math.max(0.8, 0.9 * res);
          ctx.strokeStyle = "rgba(74,224,110,0.34)";
          ctx.stroke();
        }
      }

      // --- country name labels — scaled to each country's on-screen size, so
      // big countries read at a glance and small ones only surface as you zoom
      {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        const placed = [];
        const hits = []; // drawn label boxes, for click-to-open-country
        for (const c of COUNTRY_LABELS) {
          const v = lonLatToVec(c.lat, c.lon);
          const { sx, sy, zz } = worldToScreen(v[0], v[1], v[2], s.yaw, s.pitch, cx, cy, R);
          if (zz <= 0.14) continue; // hide near / behind the limb
          const extent = c.size * DEG * R; // the country's rough on-screen span (px)
          let fs = extent * 0.16;
          if (fs < 7 * res) continue; // too small at this zoom → stays hidden
          fs = Math.min(fs, 30 * res); // never let one label dominate the view
          const isActive = c === active;
          if (isActive) fs = Math.min(fs * 1.15, 34 * res);
          ctx.font = fs + 'px "VT323", ui-monospace, monospace';
          const text = labelText(c.name);
          const w = ctx.measureText(text).width;
          if (w > extent * 1.25 && !isActive) continue; // wouldn't sit inside the country
          const h = fs;
          const box = { x: sx - w / 2, y: sy - h / 2, w, h };
          let clash = false;
          for (const p of placed) {
            if (!(box.x + box.w < p.x || p.x + p.w < box.x || box.y + box.h < p.y || p.y + p.h < box.y)) { clash = true; break; }
          }
          if (clash) continue;
          placed.push(box);
          hits.push({ x: box.x, y: box.y, w: box.w, h: box.h, country: c });
          const alpha = Math.min(1, (zz - 0.14) / 0.28); // fade in away from the limb
          ctx.lineWidth = Math.max(2, fs * 0.22);
          ctx.strokeStyle = "rgba(3,12,11," + (0.85 * alpha).toFixed(3) + ")";
          ctx.strokeText(text, sx, sy);
          ctx.fillStyle = (isActive ? "rgba(214,255,236," : "rgba(190,250,224,") + (0.94 * alpha).toFixed(3) + ")";
          ctx.fillText(text, sx, sy);
        }
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
        s.labels = hits;
      }
      ctx.restore();

      // connection arcs from the selected developer (great-circle, lifted off
      // the sphere; drawn outside the clip so the arcs can rise above the limb)
      const linkSet = P.linkSet;
      if (P.selectedId != null && linkSet && linkSet.size) {
        const src = P.developers.find((d) => d.id === P.selectedId);
        if (src) {
          const a = lonLatToVec(src.lat, src.lon);
          ctx.save();
          ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.shadowBlur = 0;
          for (let i = 0; i < P.developers.length; i++) {
            const d = P.developers[i];
            if (!linkSet.has(d.id)) continue;
            const b = lonLatToVec(d.lat, d.lon);
            const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
            const omega = Math.acos(dot);
            if (omega < 1e-3) continue;
            const sinO = Math.sin(omega);
            ctx.beginPath();
            let pen = false;
            for (let k = 0; k <= 28; k++) {
              const t = k / 28;
              const c1 = Math.sin((1 - t) * omega) / sinO, c2 = Math.sin(t * omega) / sinO;
              const x = a[0] * c1 + b[0] * c2, y = a[1] * c1 + b[1] * c2, z = a[2] * c1 + b[2] * c2;
              const { xr, yr, zz } = project(x, y, z, s.yaw, s.pitch);
              if (zz <= 0.02) { pen = false; continue; }
              const alt = 1 + 0.16 * Math.sin(Math.PI * t);
              const sx = cx - R * alt * xr, sy = cy - R * alt * yr;
              if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy);
            }
            ctx.strokeStyle = "rgba(45,212,191,0.16)";
            ctx.lineWidth = 3.2 * res; ctx.stroke();
            ctx.strokeStyle = "rgba(120,240,212,0.78)";
            ctx.lineWidth = 1.1 * res; ctx.stroke();
          }
          ctx.restore();
        }
      }

      // pins
      const pins = [];
      const hov = P.hoveredId, selId = P.selectedId, dim = P.dimSet, lnk = P.linkSet, meId = P.meId;
      ctx.save();
      for (let i = 0; i < P.developers.length; i++) {
        const d = P.developers[i];
        if (d.lat == null || d.lon == null) continue; // unlocated developers
        const v = lonLatToVec(d.lat, d.lon);
        const { sx, sy, zz } = worldToScreen(v[0], v[1], v[2], s.yaw, s.pitch, cx, cy, R);
        if (zz <= 0.03) continue;
        const dimmed = dim && !dim.has(d.id);
        const isSel = d.id === selId, isHov = d.id === hov;
        const linked = lnk && lnk.has(d.id);
        pins.push({ id: d.id, x: sx, y: sy, z: zz });
        const tw = 0.5 + 0.5 * Math.sin(s.t * 0.05 + d.id * 1.7);

        // the signed-in user — a distinct magenta diamond that ignores dimming
        if (meId != null && d.id === meId) {
          const rr = (isHov ? 4 : 3.4) * res;
          ctx.shadowColor = "#e84d8a"; ctx.shadowBlur = (isHov ? 16 : 11) * res;
          ctx.fillStyle = isHov ? "#ff79ac" : "#e84d8a";
          ctx.beginPath();
          ctx.moveTo(sx, sy - rr); ctx.lineTo(sx + rr, sy); ctx.lineTo(sx, sy + rr); ctx.lineTo(sx - rr, sy);
          ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;
          const pr = 6 * res + (s.t % 70 < 35 ? 2 * res : 0);
          ctx.strokeStyle = "rgba(232,77,138,0.5)"; ctx.lineWidth = 1 * res;
          ctx.beginPath(); ctx.arc(sx, sy, pr, 0, 6.2832); ctx.stroke();
          if (isSel) {
            ctx.strokeStyle = "rgba(240,180,41,0.95)"; ctx.lineWidth = 1.6 * res;
            ctx.beginPath(); ctx.arc(sx, sy, pr + 4 * res, 0, 6.2832); ctx.stroke();
          }
          continue;
        }

        if (dimmed && !isSel && !isHov && !linked) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(130,160,150," + (0.22 * zz).toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(sx, sy, 1.1 * res, 0, 6.2832); ctx.fill();
          continue;
        }
        if (isSel) {
          const rr = R * 0.05;
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(240,180,41,0.95)";
          ctx.lineWidth = 1.6 * res;
          ctx.beginPath(); ctx.arc(sx, sy, rr + (s.t % 40 < 20 ? 1.5 : 0), 0, 6.2832); ctx.stroke();
          ctx.strokeStyle = "rgba(240,180,41,0.5)";
          ctx.beginPath();
          ctx.moveTo(sx, sy - rr - 5 * res); ctx.lineTo(sx, sy - rr - 1 * res);
          ctx.moveTo(sx, sy + rr + 1 * res); ctx.lineTo(sx, sy + rr + 5 * res);
          ctx.moveTo(sx - rr - 5 * res, sy); ctx.lineTo(sx - rr - 1 * res, sy);
          ctx.moveTo(sx + rr + 1 * res, sy); ctx.lineTo(sx + rr + 5 * res, sy);
          ctx.stroke();
          ctx.shadowColor = "#f0b429"; ctx.shadowBlur = 10 * res;
          ctx.fillStyle = "#f6c651";
          ctx.beginPath(); ctx.arc(sx, sy, 2.6 * res, 0, 6.2832); ctx.fill();
          continue;
        }
        if (linked && !isHov) {
          ctx.shadowColor = "#2dd4bf"; ctx.shadowBlur = 9 * res;
          ctx.fillStyle = "#5fe9d6";
          ctx.beginPath(); ctx.arc(sx, sy, 2.4 * res, 0, 6.2832); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(45,212,191,0.55)"; ctx.lineWidth = 1 * res;
          ctx.beginPath(); ctx.arc(sx, sy, 4.2 * res, 0, 6.2832); ctx.stroke();
          continue;
        }
        // regular dev pins are cyan so they read clearly against the green map
        const col = isHov ? "#a5f3fc" : "#22d3ee";
        ctx.shadowColor = isHov ? "#67e8f9" : "#22d3ee";
        ctx.shadowBlur = (isHov ? 13 : 8) * res;
        ctx.globalAlpha = isHov ? 1 : 0.62 + 0.38 * tw;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(sx, sy, (isHov ? 3.2 : 2.2) * res, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      s.pins = pins;

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // pointer interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    const s = stateRef.current;

    function pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const bx = (clientX - r.left) * s.res;
      const by = (clientY - r.top) * s.res;
      const thr = (15 * s.res) * (15 * s.res);
      let best = null, bd = thr;
      for (const p of s.pins) {
        if (p.z <= 0.04) continue;
        const dx = p.x - bx, dy = p.y - by;
        const dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = p; }
      }
      if (!best) return null;
      return { id: best.id, sx: r.left + best.x / s.res, sy: r.top + best.y / s.res };
    }

    // hit-test the drawn country-name labels (canvas px), for click-to-open
    function pickLabel(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const bx = (clientX - r.left) * s.res;
      const by = (clientY - r.top) * s.res;
      for (const l of s.labels) {
        if (bx >= l.x && bx <= l.x + l.w && by >= l.y && by <= l.y + l.h) return l.country;
      }
      return null;
    }

    // active touch/mouse pointers, so two fingers can pinch-zoom on a phone
    const pointers = new Map();
    let pinchDist = 0, pinchZoom = 1;

    function down(e) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        s.dragging = true; s.moved = 0; s.lastX = e.clientX; s.lastY = e.clientY;
        canvas.classList.add("grabbing");
      } else if (pointers.size === 2) {
        s.dragging = false; s.focusing = false;
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = s.tZoom;
      }
    }
    function move(e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) s.tZoom = clampZoom((pinchZoom * d) / pinchDist);
        return;
      }
      if (s.dragging) {
        const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY;
        s.moved += Math.abs(dx) + Math.abs(dy);
        s.yaw -= dx * 0.006;
        s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch + dy * 0.006));
        s.lastX = e.clientX; s.lastY = e.clientY;
        s.focusing = false;
      } else {
        const hit = pick(e.clientX, e.clientY);
        const P = propsRef.current;
        if (hit) {
          if (P.hoveredId !== hit.id) P.onHover(hit.id);
          const d = P.developers.find((x) => x.id === hit.id);
          setTip(d ? { x: hit.sx, y: hit.sy, d } : null);
        } else {
          if (P.hoveredId != null) P.onHover(null);
          setTip(null);
        }
      }
    }
    function up(e) {
      const P = propsRef.current;
      const wasMulti = pointers.size >= 2;
      pointers.delete(e.pointerId);
      if (!wasMulti && s.dragging && s.moved < 6) {
        const hit = pick(e.clientX, e.clientY);
        if (hit) P.onSelect(hit.id);
        else {
          // not a pin — did we click a country name? open its flat map; else deselect
          const country = pickLabel(e.clientX, e.clientY);
          if (country && P.onCountryClick) P.onCountryClick(country);
          else P.onSelect(null);
        }
      }
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) {
        s.dragging = false; canvas.classList.remove("grabbing");
      } else {
        // a finger lifted mid-gesture — resume dragging from one that remains,
        // and don't let the eventual lift register as a tap
        const [p] = [...pointers.values()];
        s.lastX = p.x; s.lastY = p.y; s.dragging = true; s.moved = 999;
      }
    }
    function leave() { const P = propsRef.current; if (P.hoveredId != null) P.onHover(null); setTip(null); }
    function wheel(e) { e.preventDefault(); s.tZoom = clampZoom(s.tZoom * (e.deltaY > 0 ? 0.9 : 1.1)); }

    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <div className="globe-stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="globe-canvas"
        tabIndex={0}
        role="application"
        aria-label="Interactive developer globe. Drag to rotate, scroll to zoom, use the left and right arrow keys to browse developers."
      />
      {tip && (
        <div className={"tip" + (props.meId === tip.d.id ? " real" : "")} style={{ left: tip.x, top: tip.y }}>
          <span className="h">{tip.d.name}</span> · {tip.d.city}
          {props.meId === tip.d.id && <span className="tip-you"> · you</span>}
        </div>
      )}
    </div>
  );
});

export default Globe;
