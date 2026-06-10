/* DEVERSE — flat, zoomable mini-map of a single country.
 *
 * Opened by clicking a country name (on the globe or in the by-country list).
 * Draws the country outline from the bundled atlas, its admin-1 regions fetched
 * on demand (geoBoundaries, via src/regions.js), and the developers located
 * inside it — pan with a drag, zoom with the wheel, click a pin to open the
 * profile. Longitudes are wrapped around the country's anchor so antimeridian
 * countries (Russia, Fiji…) lay flat without tearing. */
import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { COUNTRY_OUTLINES } from "./labels.js";
import { regionPolygonsFor } from "./regions.js";

/* Wrap a longitude to within ±180° of a reference, so a country never straddles
 * the ±180 seam when projected flat. */
function wrapTo(lon, ref) {
  let l = lon;
  while (l - ref > 180) l -= 360;
  while (l - ref < -180) l += 360;
  return l;
}

/* Even-odd ray cast: is (x,y) inside this set of rings? */
function pointInRings(rings, x, y) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export default function CountryMap({ country, developers, meId, onClose, onSelect, selectedId }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const view = useRef({ zoom: 1, panX: 0, panY: 0, dragging: false, moved: 0, lastX: 0, lastY: 0, pins: [] });
  const [regions, setRegions] = useState(null);
  const [tip, setTip] = useState(null);

  const midLon = country.lon;

  // country shape (wrapped lon/lat outer rings, largest first) + its bounding box
  const geom = useMemo(() => {
    const raw = COUNTRY_OUTLINES.get(country.name) || [];
    const rings = raw.map((ring) => ring.map(([lon, lat]) => [wrapTo(lon, midLon), lat]));
    const main = rings[0] || [[midLon, country.lat]];
    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    for (const [x, y] of main) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { rings, minX, maxX, minY, maxY, cLon: (minX + maxX) / 2, cLat: (minY + maxY) / 2 };
  }, [country.name, country.lat, midLon]);

  // developers physically inside the country (point-in-polygon), drives the count
  const devsIn = useMemo(() => {
    if (!geom.rings.length) return [];
    return developers.filter(
      (d) => d.lat != null && d.lon != null && pointInRings(geom.rings, wrapTo(d.lon, midLon), d.lat),
    );
  }, [developers, geom, midLon]);

  // fetch the admin-1 regions for this country (cached across opens)
  useEffect(() => {
    let alive = true;
    setRegions(null);
    if (country.iso3) {
      regionPolygonsFor(country.iso3).then((r) => {
        if (!alive) return;
        setRegions(r.map((ring) => ring.map(([lon, lat]) => [wrapTo(lon, midLon), lat])));
      });
    } else {
      setRegions([]);
    }
    return () => { alive = false; };
  }, [country.iso3, midLon]);

  // base scale that fits the mainland bbox into the canvas (before user zoom)
  const fit = useCallback(
    (bw, bh) => {
      const pad = 24;
      const cosMid = Math.max(0.2, Math.cos((geom.cLat * Math.PI) / 180));
      const spanX = Math.max(0.5, (geom.maxX - geom.minX) * cosMid);
      const spanY = Math.max(0.5, geom.maxY - geom.minY);
      const k = Math.min((bw - 2 * pad) / spanX, (bh - 2 * pad) / spanY);
      return { k, cosMid };
    },
    [geom],
  );

  const project = useCallback(
    (lon, lat, bw, bh) => {
      const v = view.current;
      const { k, cosMid } = fit(bw, bh);
      const sx = bw / 2 + (wrapTo(lon, midLon) - geom.cLon) * k * cosMid * v.zoom + v.panX;
      const sy = bh / 2 - (lat - geom.cLat) * k * v.zoom + v.panY;
      return [sx, sy];
    },
    [fit, geom, midLon],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const bw = canvas.width, bh = canvas.height;
    const res = Math.min(2, window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, bw, bh);
    ctx.fillStyle = "#06110f";
    ctx.fillRect(0, 0, bw, bh);

    const strokeRingSet = (ringSet, lineW, style, fillStyle) => {
      if (!ringSet || !ringSet.length) return;
      ctx.beginPath();
      for (const ring of ringSet) {
        for (let i = 0; i < ring.length; i++) {
          const [sx, sy] = project(ring[i][0], ring[i][1], bw, bh);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
      }
      if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill("evenodd"); }
      ctx.lineJoin = "round"; ctx.lineWidth = lineW; ctx.strokeStyle = style; ctx.stroke();
    };

    // country body + outline, then internal region borders
    strokeRingSet(geom.rings, 1.6 * res, "rgba(74,224,110,0.85)", "rgba(45,212,191,0.07)");
    if (regions && regions.length) strokeRingSet(regions, 0.8 * res, "rgba(74,224,110,0.32)", null);

    // developer pins
    const pins = [];
    for (const d of devsIn) {
      const [sx, sy] = project(d.lon, d.lat, bw, bh);
      pins.push({ id: d.id, x: sx, y: sy });
      const isSel = d.id === selectedId, isMe = meId != null && d.id === meId;
      ctx.beginPath();
      ctx.arc(sx, sy, (isSel ? 4 : 2.6) * res, 0, 6.2832);
      ctx.fillStyle = isMe ? "#e84d8a" : isSel ? "#f6c651" : "#22d3ee";
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = (isSel ? 12 : 7) * res;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (isSel) {
        ctx.strokeStyle = "rgba(240,180,41,0.9)"; ctx.lineWidth = 1.4 * res;
        ctx.beginPath(); ctx.arc(sx, sy, 7 * res, 0, 6.2832); ctx.stroke();
      }
    }
    view.current.pins = pins;
  }, [geom, regions, devsIn, project, selectedId, meId]);

  // size the canvas to its box and redraw on resize / data change
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const res = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      canvas.width = Math.max(2, Math.round(r.width * res));
      canvas.height = Math.max(2, Math.round(r.height * res));
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  // pan (drag) + zoom (wheel, about the cursor) + click-to-select
  useEffect(() => {
    const canvas = canvasRef.current;
    const res = Math.min(2, window.devicePixelRatio || 1);
    const toCanvas = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * res, (e.clientY - r.top) * res];
    };
    const pick = (cx, cy) => {
      let best = null, bd = (12 * res) * (12 * res);
      for (const p of view.current.pins) {
        const dx = p.x - cx, dy = p.y - cy, dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = p; }
      }
      return best;
    };
    const down = (e) => {
      const v = view.current; v.dragging = true; v.moved = 0; v.lastX = e.clientX; v.lastY = e.clientY;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      const v = view.current;
      if (v.dragging) {
        const dx = (e.clientX - v.lastX) * res, dy = (e.clientY - v.lastY) * res;
        v.moved += Math.abs(dx) + Math.abs(dy); v.panX += dx; v.panY += dy;
        v.lastX = e.clientX; v.lastY = e.clientY; draw();
      } else {
        const [cx, cy] = toCanvas(e); const hit = pick(cx, cy);
        if (hit) {
          const d = devsIn.find((x) => x.id === hit.id);
          const r = canvas.getBoundingClientRect();
          setTip(d ? { x: hit.x / res + r.left, y: hit.y / res + r.top, d } : null);
        } else setTip(null);
      }
    };
    const up = (e) => {
      const v = view.current;
      if (v.dragging && v.moved < 6) {
        const [cx, cy] = toCanvas(e); const hit = pick(cx, cy);
        if (hit) onSelect(hit.id);
      }
      v.dragging = false;
    };
    const wheel = (e) => {
      e.preventDefault();
      const v = view.current;
      const [cx, cy] = toCanvas(e);
      const f = e.deltaY > 0 ? 0.88 : 1.14;
      const z2 = Math.max(1, Math.min(60, v.zoom * f));
      const ratio = z2 / v.zoom;
      v.panX = cx - canvas.width / 2 - (cx - canvas.width / 2 - v.panX) * ratio;
      v.panY = cy - canvas.height / 2 - (cy - canvas.height / 2 - v.panY) * ratio;
      v.zoom = z2; draw();
    };
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [devsIn, draw, onSelect]);

  const resetView = () => { view.current.zoom = 1; view.current.panX = 0; view.current.panY = 0; draw(); };

  return (
    <div className="cmap panel" role="dialog" aria-label={"Map of " + country.name}>
      <div className="cmap-head">
        <div>
          <div className="cmap-name">{country.name}</div>
          <div className="cmap-sub">
            {devsIn.length} dev{devsIn.length === 1 ? "" : "s"}
            {country.iso3 == null
              ? ""
              : regions == null
                ? " · loading regions…"
                : regions.length
                  ? " · regions"
                  : " · no region data"}
          </div>
        </div>
        <button className="cmap-x" aria-label="Close map" onClick={onClose}>×</button>
      </div>
      <div className="cmap-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="cmap-canvas" />
        <button className="cmap-reset" onClick={resetView} title="Reset view">⟲</button>
        {tip && (
          <div className="cmap-tip" style={{ left: tip.x, top: tip.y }}>
            <b>{tip.d.name}</b> · {tip.d.city}
          </div>
        )}
      </div>
      <div className="cmap-foot">drag to pan · scroll to zoom · click a pin</div>
    </div>
  );
}
