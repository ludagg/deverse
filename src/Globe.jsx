/* DEVERSE — vector country-outline globe (canvas, hi-res). */
import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import { GEO_RINGS } from "./geo.js";
import { lonLatToVec, project, worldToScreen } from "./projection.js";

const DEG = Math.PI / 180;

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
    yaw: -1.9, pitch: 0.32, zoom: 1,
    tYaw: -1.9, tPitch: 0.32, focusing: false,
    dragging: false, moved: 0, lastX: 0, lastY: 0,
    res: 2, bw: 0, bh: 0,
    pins: [], t: 0,
  });
  const propsRef = useRef(props);
  propsRef.current = props;
  const [tip, setTip] = useState(null);

  if (!gratRef.current) gratRef.current = buildGraticule();

  useImperativeHandle(ref, () => ({
    zoomBy: (f) => { const s = stateRef.current; s.zoom = Math.max(0.7, Math.min(2.6, s.zoom * f)); },
    reset: () => { const s = stateRef.current; s.tYaw = -1.9; s.tPitch = 0.32; s.focusing = true; s.zoom = 1; },
    focusLatLon: (lat, lon) => {
      const s = stateRef.current;
      s.tYaw = lon * DEG; s.tPitch = Math.max(-1.0, Math.min(1.0, lat * DEG)); s.focusing = true;
    },
  }));

  useEffect(() => {
    if (!props.focusTarget) return;
    const s = stateRef.current;
    s.tYaw = props.focusTarget.lon * DEG;
    s.tPitch = Math.max(-1.0, Math.min(1.0, props.focusTarget.lat * DEG));
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
      } else if (P.autoToggle && !s.dragging && !P.selectedId) {
        s.yaw -= 0.0019;
      }

      const bw = s.bw, bh = s.bh, res = s.res;
      const cx = bw / 2, cy = bh / 2;
      const R = Math.min(bw, bh) * 0.46 * s.zoom;
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
        ctx.strokeStyle = "rgba(74,224,110,0.92)";
        ctx.stroke();
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
      const hov = P.hoveredId, selId = P.selectedId, dim = P.dimSet, lnk = P.linkSet;
      ctx.save();
      for (let i = 0; i < P.developers.length; i++) {
        const d = P.developers[i];
        const v = lonLatToVec(d.lat, d.lon);
        const { sx, sy, zz } = worldToScreen(v[0], v[1], v[2], s.yaw, s.pitch, cx, cy, R);
        if (zz <= 0.03) continue;
        const dimmed = dim && !dim.has(d.id);
        const isSel = d.id === selId, isHov = d.id === hov;
        const linked = lnk && lnk.has(d.id);
        pins.push({ id: d.id, x: sx, y: sy, z: zz });
        const tw = 0.5 + 0.5 * Math.sin(s.t * 0.05 + d.id * 1.7);

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
        const col = isHov ? "#34e1cc" : "#3ee05a";
        ctx.shadowColor = isHov ? "#2dd4bf" : "#39d353";
        ctx.shadowBlur = (isHov ? 12 : 7) * res;
        ctx.globalAlpha = isHov ? 1 : 0.6 + 0.4 * tw;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(sx, sy, (isHov ? 3.1 : 2.1) * res, 0, 6.2832); ctx.fill();
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

    function down(e) {
      s.dragging = true; s.moved = 0;
      s.lastX = e.clientX; s.lastY = e.clientY;
      canvas.classList.add("grabbing");
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    }
    function move(e) {
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
      if (s.dragging && s.moved < 6) {
        const hit = pick(e.clientX, e.clientY);
        P.onSelect(hit ? hit.id : null);
      }
      s.dragging = false;
      canvas.classList.remove("grabbing");
    }
    function leave() { const P = propsRef.current; if (P.hoveredId != null) P.onHover(null); setTip(null); }
    function wheel(e) { e.preventDefault(); s.zoom = Math.max(0.7, Math.min(2.6, s.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }

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
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          <span className="h">{tip.d.name}</span> · {tip.d.city}
        </div>
      )}
    </div>
  );
});

export default Globe;
