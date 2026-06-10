/* DEVERSE — UI layer. */
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import D from "./data.js";
import Globe from "./Globe.jsx";

/* ---- pixel identicon avatar ---- */
function PixelAvatar({ seed, size = 64 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const grid = 5;
    let a = (seed >>> 0) || 1;
    const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    const pals = [["#39d353", "#08130f"], ["#2dd4bf", "#08130f"], ["#f0b429", "#0f0c06"], ["#e84d8a", "#100810"], ["#7fd1c0", "#06121a"]];
    const [fg, bg] = pals[Math.floor(rnd() * pals.length)];
    c.width = grid; c.height = grid;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, grid, grid);
    ctx.fillStyle = fg;
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < grid; y++) {
        if (rnd() > 0.5) { ctx.fillRect(x, y, 1, 1); ctx.fillRect(grid - 1 - x, y, 1, 1); }
      }
    }
  }, [seed]);
  return <canvas ref={ref} className="avatar pix" style={{ width: size, height: size }} />;
}

/* ---- GitHub mark ---- */
function GitHubMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function strHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---- Sign in with GitHub (mocked OAuth flow) ---- */
function GitHubAuth() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deverse_gh_user") || "null"); } catch { return null; }
  });
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState("");
  const [authing, setAuthing] = useState(false);

  useEffect(() => {
    if (user) localStorage.setItem("deverse_gh_user", JSON.stringify(user));
    else localStorage.removeItem("deverse_gh_user");
  }, [user]);

  const open = () => { setName(""); setAuthing(false); setModal(true); };
  const authorize = () => {
    const handle = (name.trim().replace(/^@/, "") || "octodev").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20);
    setAuthing(true);
    setTimeout(() => {
      setUser({ handle, seed: strHash(handle) });
      setAuthing(false);
      setModal(false);
    }, 1100);
  };
  const signOut = () => { setUser(null); setMenu(false); };

  if (user) {
    return (
      <div className="gh-wrap">
        <button className="gh-user panel" onClick={() => setMenu((v) => !v)}>
          <PixelAvatar seed={user.seed} size={22} />
          <span className="gh-handle">@{user.handle}</span>
          <span className="gh-caret">▾</span>
        </button>
        {menu && (
          <div className="gh-menu panel">
            <div className="gh-menu-head">
              <span className="gh-dot online" /> on the map
            </div>
            <button className="gh-menu-item" onClick={() => setMenu(false)}>My profile</button>
            <button className="gh-menu-item danger" onClick={signOut}>Disconnect</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button className="gh-btn" onClick={open}>
        <GitHubMark size={16} />
        <span>Sign in with GitHub</span>
      </button>
      {modal && (
        <div className="modal-overlay" onClick={() => !authing && setModal(false)}>
          <div className="gh-modal panel" onClick={(e) => e.stopPropagation()}>
            <div className="gh-modal-top">
              <GitHubMark size={26} />
              <button className="gh-x" onClick={() => setModal(false)} disabled={authing}>×</button>
            </div>
            <div className="gh-modal-title">Authorize <b>DEVERSE</b></div>
            <div className="gh-modal-sub">Join the map — sign up is GitHub-only.</div>
            <div className="gh-field">
              <label>github.com /</label>
              <input
                autoFocus
                value={name}
                placeholder="your-username"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && authorize()}
              />
            </div>
            <ul className="gh-scopes">
              <li><span className="ok">✓</span> Read your public profile</li>
              <li><span className="ok">✓</span> Read public repos &amp; languages</li>
              <li><span className="ok">✓</span> Pin you on the developer map</li>
            </ul>
            <button className={"gh-authorize" + (authing ? " busy" : "")} onClick={authorize} disabled={authing}>
              <GitHubMark size={16} />
              <span>{authing ? "Authorizing…" : "Authorize & join"}</span>
            </button>
            <div className="gh-foot">DEVERSE never sees your password · OAuth via GitHub</div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---- profile panel ---- */
function Profile({ d, onClose }) {
  if (!d) return null;
  return (
    <div className="profile panel">
      <button className="close" onClick={onClose} aria-label="close">×</button>
      <div className="ph">
        <PixelAvatar seed={d.avatar} size={64} />
        <div>
          <div className="nm">{d.name}</div>
          <div className="hd">{d.handle}</div>
          <div className="loc"><span className={"st " + d.status} />{d.city}, {d.country}</div>
        </div>
      </div>
      <div className="statgrid">
        <div className="s"><div className="v">{d.years}y</div><div className="k">Exp</div></div>
        <div className="s"><div className="v">{d.repos}</div><div className="k">Repos</div></div>
        <div className="s"><div className="v">{d.stars >= 1000 ? (d.stars / 1000).toFixed(1) + "k" : d.stars}</div><div className="k">Stars</div></div>
      </div>
      <div className="pbody">
        <div className="field">
          <div className="lab">Focus</div>
          <div className="val">{d.focus}</div>
        </div>
        <div className="field">
          <div className="lab">Stack</div>
          <div className="taglist">{d.langs.map((l) => <span className="tag" key={l}>{l}</span>)}</div>
        </div>
        <div className="field">
          <div className="lab">Status</div>
          <div className="st-row"><span className={"st " + d.status} />{d.status}</div>
        </div>
        <div className="field">
          <div className="tagline">“{d.tagline}”</div>
        </div>
      </div>
      <div className="pfoot">
        <button className="btn">View profile</button>
        <button className="btn ghost">Message</button>
      </div>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [activeLangs, setActiveLangs] = useState(() => new Set());
  const [activeCountry, setActiveCountry] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [autoToggle, setAutoToggle] = useState(true);
  const [focusTarget, setFocusTarget] = useState(null);
  const [booted, setBooted] = useState(false);
  const globeRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => setBooted(true), 1100); return () => clearTimeout(t); }, []);

  const topLangs = useMemo(() => D.topLangs.slice(0, 14), []);
  const countries = useMemo(
    () => Object.entries(D.countryCounts).sort((a, b) => b[1] - a[1]),
    []
  );
  const maxCountry = countries[0][1];

  // which dev ids pass the active filters/search
  const dimSet = useMemo(() => {
    const hasLang = activeLangs.size > 0;
    const q = query.trim().toLowerCase();
    if (!hasLang && !activeCountry && !q) return null;
    const set = new Set();
    for (const d of D.developers) {
      if (hasLang && !d.langs.some((l) => activeLangs.has(l))) continue;
      if (activeCountry && d.country !== activeCountry) continue;
      if (q) {
        const hay = (d.name + " " + d.handle + " " + d.city + " " + d.country + " " + d.langs.join(" ") + " " + d.focus).toLowerCase();
        if (!hay.includes(q)) continue;
      }
      set.add(d.id);
    }
    return set;
  }, [activeLangs, activeCountry, query]);

  const matchCount = dimSet ? dimSet.size : D.developers.length;

  const selected = useMemo(() => D.developers.find((d) => d.id === selectedId) || null, [selectedId]);

  const toggleLang = (l) => {
    setActiveLangs((prev) => { const n = new Set(prev); n.has(l) ? n.delete(l) : n.add(l); return n; });
  };
  const selectCountry = (c) => {
    setActiveCountry((cur) => (cur === c ? null : c));
    const cc = D.cities.find((x) => x.country === c);
    if (cc && activeCountry !== c) { globeRef.current && globeRef.current.focusLatLon(cc.lat, cc.lon); }
  };

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
    if (id != null) {
      const d = D.developers.find((x) => x.id === id);
      if (d) setFocusTarget({ lat: d.lat, lon: d.lon, k: id });
    }
  }, []);
  const handleHover = useCallback((id) => setHoveredId(id), []);

  // Enter in search → focus & select first match
  const onSearchKey = (e) => {
    if (e.key === "Enter" && dimSet && dimSet.size) {
      const first = D.developers.find((d) => dimSet.has(d.id));
      if (first) handleSelect(first.id);
    }
  };

  return (
    <div className="app">
      <Globe
        ref={globeRef}
        developers={D.developers}
        onHover={handleHover}
        onSelect={handleSelect}
        hoveredId={hoveredId}
        selectedId={selectedId}
        dimSet={dimSet}
        focusTarget={focusTarget}
        autoToggle={autoToggle}
      />

      {/* top bar */}
      <div className="topbar">
        <div className="brand">
          <div className="mark" />
          <div>
            <h1>DEVERSE</h1>
            <div className="sub">world.map(dev)</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="status-pill panel">
            <span className="dot-live" />
            <span><b>{D.developers.length}</b> devs</span>
            <span className="sep" />
            <span><b>{Object.keys(D.countryCounts).length}</b> countries</span>
          </div>
          <GitHubAuth />
        </div>
      </div>

      {/* left rail */}
      <div className="rail">
        <div className="search panel">
          <span className="prompt">&gt;</span>
          <input
            value={query}
            placeholder="search devs, cities, stacks…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
          {query === "" && <span className="cursor" />}
        </div>

        <div className="panel card-pad">
          <div className="card-head">
            <span className="panel-title">Filter · stack</span>
            {activeLangs.size > 0 && (
              <button className="panel-title" style={{ color: "var(--teal)" }} onClick={() => setActiveLangs(new Set())}>clear</button>
            )}
          </div>
          <div className="chips scroll">
            {topLangs.map((l) => (
              <button key={l} className={"chip" + (activeLangs.has(l) ? " on" : "")} onClick={() => toggleLang(l)}>
                {l}<span className="n">{D.langCounts[l]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel card-pad" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="card-head">
            <span className="panel-title">By country</span>
            <span className="panel-title" style={{ color: "var(--green)" }}>{matchCount} shown</span>
          </div>
          <div className="country-list scroll" style={{ flex: 1 }}>
            {countries.map(([c, n]) => (
              <button key={c} className={"country-row" + (activeCountry === c ? " on" : "")} onClick={() => selectCountry(c)}>
                <span>{c}</span>
                <span className="meta">
                  <span className="bar" style={{ width: 8 + (n / maxCountry) * 56 }} />
                  <span className="cn">{n}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* profile */}
      {selected && <Profile d={selected} onClose={() => handleSelect(null)} />}

      {/* controls */}
      <div className="controls panel">
        <button className="ctrl" title="Zoom out" onClick={() => globeRef.current.zoomBy(0.85)}>–</button>
        <button className="ctrl" title="Zoom in" onClick={() => globeRef.current.zoomBy(1.18)}>+</button>
        <button className={"ctrl wide" + (autoToggle ? " on" : "")} onClick={() => setAutoToggle((v) => !v)}>
          ◐ spin
        </button>
        <button className="ctrl wide" onClick={() => { globeRef.current.reset(); setActiveCountry(null); }}>⟲ reset</button>
      </div>

      <div className="hint">drag to rotate · scroll to zoom · <b>click a pin</b> for the profile</div>

      <div className="legend panel">
        <div className="lg"><span className="sw" style={{ background: "var(--green)" }} />developer</div>
        <div className="lg"><span className="sw" style={{ background: "var(--teal)" }} />hovered</div>
        <div className="lg"><span className="sw" style={{ background: "var(--amber)" }} />selected</div>
      </div>

      {/* overlays */}
      <div className="grain" />
      <div className="scanlines" />
      <div className="flicker" />
      <div className="vignette" />

      <div className={"boot" + (booted ? " gone" : "")}>
        <div>
          <div className="bw">DEVERSE&nbsp;OS&nbsp;v1.0</div>
          <div style={{ marginTop: 16, color: "var(--ink-2)" }}>booting world map…</div>
          <div style={{ color: "var(--green)" }}>loading {D.developers.length} developers ▓▓▓▓▓▓▓▓</div>
        </div>
      </div>
    </div>
  );
}
