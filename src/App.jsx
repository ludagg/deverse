/* DEVERSE — UI layer. */
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import D from "./data.js";
import Globe from "./Globe.jsx";
import { tallies, peersOf } from "./derive.js";
import {
  oauthConfigured,
  beginOAuth,
  pendingOAuthCode,
  exchangeOAuthCode,
  fetchPublicProfile,
  buildDeveloper,
  seniority,
} from "./github.js";

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

/* Real users carry a GitHub avatar URL; everyone else gets a generated identicon. */
function Avatar({ d, size = 64 }) {
  if (d.avatarUrl) {
    return <img className="avatar pix" src={d.avatarUrl} alt={d.name} width={size} height={size} style={{ width: size, height: size }} />;
  }
  return <PixelAvatar seed={d.avatar} size={size} />;
}

/* ---- seniority stars ---- */
function Stars({ rank }) {
  return (
    <span className="stars" aria-label={rank + " out of 5"}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= rank ? "" : "off"}>★</span>)}
    </span>
  );
}

/* ---- GitHub mark ---- */
function GitHubMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/* ---- Sign in with GitHub (real OAuth, with a public-API fallback) ---- */
function GitHubAuth({ me, onAuthed, onSignOut, onShowProfile }) {
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(null); // label shown while a request is in flight
  const [error, setError] = useState("");
  const didRedirect = useRef(false);

  // If we just came back from GitHub's consent screen, finish the OAuth exchange.
  useEffect(() => {
    if (didRedirect.current) return;
    didRedirect.current = true;
    const code = pendingOAuthCode();
    if (!code) return;
    setBusy("Completing sign-in…");
    (async () => {
      try {
        // the serverless function geocodes, persists to the shared DB and
        // returns a ready-to-pin developer
        onAuthed(await exchangeOAuthCode(code));
      } catch (e) {
        setError(e.message || "Sign-in failed.");
        setModal(true);
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSignIn = () => {
    setError("");
    if (oauthConfigured()) {
      setBusy("Redirecting to GitHub…");
      beginOAuth();
      return;
    }
    // no OAuth app configured → pull the public profile by username instead
    setName("");
    setModal(true);
  };

  const submitUsername = async () => {
    const login = name.trim().replace(/^@/, "").replace(/\s+/g, "");
    if (!login) return;
    setError("");
    setBusy("Fetching profile…");
    try {
      const profile = await fetchPublicProfile(login);
      onAuthed(await buildDeveloper(profile));
      setModal(false);
    } catch (e) {
      setError(e.message || "Could not load that profile.");
    } finally {
      setBusy(null);
    }
  };

  const signOut = () => { setMenu(false); onSignOut(); };

  if (me) {
    return (
      <div className="gh-wrap">
        <button className="gh-user panel" onClick={() => setMenu((v) => !v)}>
          <Avatar d={me} size={22} />
          <span className="gh-handle">@{me.login}</span>
          <span className="gh-caret">▾</span>
        </button>
        {menu && (
          <div className="gh-menu panel">
            <div className="gh-menu-head">
              <span className={"gh-dot " + (me.located ? "online" : "")} /> {me.located ? "on the map" : "location not set"}
            </div>
            <button className="gh-menu-item" onClick={() => { setMenu(false); onShowProfile(); }}>My profile</button>
            <a className="gh-menu-item" href={me.htmlUrl} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>Open on GitHub ↗</a>
            <button className="gh-menu-item danger" onClick={signOut}>Disconnect</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button className="gh-btn" onClick={startSignIn} disabled={!!busy}>
        <GitHubMark size={16} />
        <span>{busy || "Sign in with GitHub"}</span>
      </button>
      {modal && (
        <div className="modal-overlay" onClick={() => !busy && setModal(false)}>
          <div
            className="gh-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gh-modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape" && !busy) setModal(false); }}
          >
            <div className="gh-modal-top">
              <GitHubMark size={26} />
              <button className="gh-x" aria-label="Close" onClick={() => setModal(false)} disabled={!!busy}>×</button>
            </div>
            <div className="gh-modal-title" id="gh-modal-title">Join <b>DEVERSE</b></div>
            <div className="gh-modal-sub">Enter a GitHub username — we pull the public profile, repos &amp; languages and pin it on the map for real.</div>
            <div className="gh-field">
              <label>github.com /</label>
              <input
                autoFocus
                value={name}
                placeholder="your-username"
                disabled={!!busy}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && submitUsername()}
              />
            </div>
            <ul className="gh-scopes">
              <li><span className="ok">✓</span> Real public profile &amp; avatar</li>
              <li><span className="ok">✓</span> Public repos &amp; top languages</li>
              <li><span className="ok">✓</span> Geocoded onto the developer map</li>
            </ul>
            {error && <div className="gh-err">{error}</div>}
            <button className={"gh-authorize" + (busy ? " busy" : "")} onClick={submitUsername} disabled={!!busy}>
              <GitHubMark size={16} />
              <span>{busy || "Fetch & join"}</span>
            </button>
            <div className="gh-foot">Public GitHub data only · no password, no token stored</div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---- profile panel ---- */
function Profile({ d, onClose }) {
  if (!d) return null;
  const real = d.real;
  return (
    <div className="profile panel" role="dialog" aria-label={"Developer profile: " + d.name}>
      <button className="close" onClick={onClose} aria-label="Close profile">×</button>
      <div className="ph">
        <Avatar d={d} size={64} />
        <div>
          <div className="nm">{d.name}{real && <span className="real-badge">GitHub</span>}</div>
          <div className="hd">{d.handle}</div>
          <div className="loc">
            <span className={"st " + d.status} />
            {d.located || !real ? (d.country ? `${d.city}, ${d.country}` : d.city) : <span className="muted-loc">location not set</span>}
          </div>
        </div>
      </div>
      <div className="statgrid">
        <div className="s"><div className="v">{real ? d.years + "y" : d.years + "y"}</div><div className="k">{real ? "On GH" : "Exp"}</div></div>
        <div className="s"><div className="v">{d.repos}</div><div className="k">Repos</div></div>
        <div className="s"><div className="v">{d.stars >= 1000 ? (d.stars / 1000).toFixed(1) + "k" : d.stars}</div><div className="k">Stars</div></div>
      </div>
      <div className="pbody">
        <div className="field">
          <div className="lab">Level</div>
          <div className="rating"><Stars rank={seniority(d).rank} /> <span className="tier">{seniority(d).tier}</span></div>
        </div>
        <div className="field">
          <div className="lab">Focus</div>
          <div className="val">{d.focus}</div>
        </div>
        <div className="field">
          <div className="lab">{real ? "Top languages" : "Stack"}</div>
          <div className="taglist">{d.langs.map((l) => <span className="tag" key={l}>{l}</span>)}</div>
        </div>
        <div className="field">
          <div className="lab">Status</div>
          <div className="st-row"><span className={"st " + d.status} />{real ? "signed in" : d.status}</div>
        </div>
        <div className="field">
          <div className="tagline">“{d.tagline}”</div>
        </div>
      </div>
      <div className="pfoot">
        {real ? (
          <a className="btn" href={d.htmlUrl} target="_blank" rel="noreferrer">View on GitHub ↗</a>
        ) : (
          <>
            <button className="btn">View profile</button>
            <button className="btn ghost">Message</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- shareable state <-> URL query string ---- */
function readState() {
  const p = new URLSearchParams(window.location.search);
  const langs = (p.get("langs") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const devRaw = p.get("dev");
  const devId = devRaw && /^\d+$/.test(devRaw) ? Number(devRaw) : null;
  return {
    query: p.get("q") || "",
    activeLangs: new Set(langs),
    activeCountry: p.get("country") || null,
    selectedId: devId,
    onlineOnly: p.get("online") === "1",
  };
}

export default function App() {
  const init = useMemo(() => readState(), []);
  const [query, setQuery] = useState(init.query);
  const [activeLangs, setActiveLangs] = useState(() => init.activeLangs);
  const [activeCountry, setActiveCountry] = useState(init.activeCountry);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(init.selectedId);
  const [autoToggle, setAutoToggle] = useState(true);
  const [focusTarget, setFocusTarget] = useState(null);
  const [booted, setBooted] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(init.onlineOnly);
  // the signed-in real GitHub developer (persisted), overlaid on the fiction
  const [me, setMe] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deverse_me") || "null"); } catch { return null; }
  });
  const globeRef = useRef(null);

  useEffect(() => {
    if (me) localStorage.setItem("deverse_me", JSON.stringify(me));
    else localStorage.removeItem("deverse_me");
  }, [me]);

  // real developers from the shared database; falls back to the bundled fiction
  // until the DB is configured (or if the request fails) so nothing ever breaks
  const [remoteDevs, setRemoteDevs] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/developers")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => alive && setRemoteDevs(Array.isArray(list) ? list : []))
      .catch(() => alive && setRemoteDevs([]));
    return () => { alive = false; };
  }, []);

  const base = remoteDevs && remoteDevs.length ? remoteDevs : D.developers;

  // overlay the signed-in user immediately (before the DB round-trip catches up)
  const developers = useMemo(() => {
    if (!me) return base;
    return base.some((d) => d.id === me.id) ? base : [...base, me];
  }, [base, me]);

  const { langCounts, topLangs, countryCounts } = useMemo(() => {
    const t = tallies(developers);
    return { langCounts: t.langCounts, topLangs: t.topLangs.slice(0, 14), countryCounts: t.countryCounts };
  }, [developers]);

  const onlineCount = useMemo(() => developers.filter((d) => d.status === "online").length, [developers]);
  const countryCount = useMemo(() => new Set(developers.map((d) => d.country).filter(Boolean)).size, [developers]);

  useEffect(() => { const t = setTimeout(() => setBooted(true), 1100); return () => clearTimeout(t); }, []);

  // recenter on a deep-linked developer at startup
  useEffect(() => {
    if (init.selectedId == null) return;
    const d = developers.find((x) => x.id === init.selectedId);
    if (d && d.lat != null) setFocusTarget({ lat: d.lat, lon: d.lon, k: d.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the URL in sync so the current view is shareable
  useEffect(() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set("q", query.trim());
    if (activeLangs.size) p.set("langs", [...activeLangs].join(","));
    if (activeCountry) p.set("country", activeCountry);
    if (selectedId != null) p.set("dev", String(selectedId));
    if (onlineOnly) p.set("online", "1");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? "?" + qs : window.location.pathname);
  }, [query, activeLangs, activeCountry, selectedId, onlineOnly]);

  const countries = useMemo(
    () => Object.entries(countryCounts).sort((a, b) => b[1] - a[1]),
    [countryCounts]
  );
  const maxCountry = countries.length ? countries[0][1] : 1;

  // which dev ids pass the active filters/search
  const dimSet = useMemo(() => {
    const hasLang = activeLangs.size > 0;
    const q = query.trim().toLowerCase();
    if (!hasLang && !activeCountry && !q && !onlineOnly) return null;
    const set = new Set();
    for (const d of developers) {
      if (onlineOnly && d.status !== "online") continue;
      if (hasLang && !d.langs.some((l) => activeLangs.has(l))) continue;
      if (activeCountry && d.country !== activeCountry) continue;
      if (q) {
        const hay = (d.name + " " + d.handle + " " + d.city + " " + d.country + " " + d.langs.join(" ") + " " + d.focus).toLowerCase();
        if (!hay.includes(q)) continue;
      }
      set.add(d.id);
    }
    return set;
  }, [activeLangs, activeCountry, query, onlineOnly, developers]);

  const matchCount = dimSet ? dimSet.size : developers.length;

  // developers passing the active filters, as a tappable list (mobile-friendly)
  const results = useMemo(() => (dimSet ? developers.filter((d) => dimSet.has(d.id)) : []), [dimSet, developers]);

  const selected = useMemo(() => developers.find((d) => d.id === selectedId) || null, [selectedId, developers]);

  // the selected developer's network (seeded graph for fiction, derived peers
  // sharing a language for real developers) — drives the arcs + highlights
  const linkSet = useMemo(() => peersOf(selected, developers), [selected, developers]);

  const toggleLang = (l) => {
    setActiveLangs((prev) => { const n = new Set(prev); n.has(l) ? n.delete(l) : n.add(l); return n; });
  };
  const selectCountry = (c) => {
    setActiveCountry((cur) => (cur === c ? null : c));
    const cc = developers.find((x) => x.country === c && x.lat != null);
    if (cc && activeCountry !== c) { globeRef.current && globeRef.current.focusLatLon(cc.lat, cc.lon); }
    setRailOpen(false);
  };

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
    if (id != null) {
      const d = developers.find((x) => x.id === id);
      if (d && d.lat != null) setFocusTarget({ lat: d.lat, lon: d.lon, k: id });
    }
  }, [developers]);
  const handleHover = useCallback((id) => setHoveredId(id), []);

  // bring the freshly-authed real user into focus
  const handleAuthed = useCallback((dev) => {
    setMe(dev);
    setSelectedId(dev.id);
    if (dev.lat != null) setFocusTarget({ lat: dev.lat, lon: dev.lon, k: dev.id });
  }, []);
  const handleSignOut = useCallback(() => {
    setMe((cur) => { if (cur && selectedId === cur.id) setSelectedId(null); return null; });
  }, [selectedId]);
  const showMyProfile = useCallback(() => {
    if (!me) return;
    setSelectedId(me.id);
    if (me.lat != null) setFocusTarget({ lat: me.lat, lon: me.lon, k: me.id });
  }, [me]);

  // keyboard: ←/→ (or ↑/↓) browse the currently shown developers, Esc closes
  const cycleSelection = useCallback((dir) => {
    const list = dimSet ? developers.filter((d) => dimSet.has(d.id)) : developers;
    if (!list.length) return;
    const at = list.findIndex((d) => d.id === selectedId);
    const next = at === -1 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length;
    handleSelect(list[next].id);
  }, [dimSet, selectedId, handleSelect, developers]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setRailOpen(false); if (selectedId != null) handleSelect(null); return; }
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); cycleSelection(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); cycleSelection(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, cycleSelection, handleSelect]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  // Enter in search → focus & select first match
  const onSearchKey = (e) => {
    if (e.key === "Enter" && dimSet && dimSet.size) {
      const first = developers.find((d) => dimSet.has(d.id));
      if (first) { handleSelect(first.id); setRailOpen(false); }
    }
  };

  return (
    <div className="app">
      <Globe
        ref={globeRef}
        developers={developers}
        onHover={handleHover}
        onSelect={handleSelect}
        hoveredId={hoveredId}
        selectedId={selectedId}
        meId={me ? me.id : null}
        dimSet={dimSet}
        linkSet={linkSet}
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
          <button
            className={"online-toggle panel" + (onlineOnly ? " on" : "")}
            aria-pressed={onlineOnly}
            title="Show only developers who are online now"
            onClick={() => setOnlineOnly((v) => !v)}
          >
            <span className="dot-live" />
            <span><b>{onlineCount}</b> online</span>
          </button>
          <div className="status-pill panel">
            <span><b>{developers.length}</b> devs</span>
            <span className="sep" />
            <span><b>{countryCount}</b> countries</span>
          </div>
          <GitHubAuth me={me} onAuthed={handleAuthed} onSignOut={handleSignOut} onShowProfile={showMyProfile} />
        </div>
      </div>

      {/* mobile drawer toggle */}
      <button
        className="rail-toggle panel"
        aria-label={railOpen ? "Close filters" : "Open search & filters"}
        aria-expanded={railOpen}
        onClick={() => setRailOpen((v) => !v)}
      >
        {railOpen ? "×" : "≡"} <span>filters</span>
      </button>
      {railOpen && <div className="drawer-scrim" onClick={() => setRailOpen(false)} />}

      {/* left rail */}
      <div className={"rail" + (railOpen ? " open" : "")} role="search">
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
                {l}<span className="n">{langCounts[l]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel card-pad" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {dimSet ? (
            <>
              <div className="card-head">
                <span className="panel-title">Results</span>
                <span className="panel-title" style={{ color: "var(--green)" }}>{matchCount} found</span>
              </div>
              <div className="results scroll" style={{ flex: 1 }}>
                {results.length === 0 && <div className="result-empty">No developers match.</div>}
                {results.slice(0, 150).map((d) => (
                  <button
                    key={d.id}
                    className={"result-row" + (d.real ? " real" : "") + (d.id === selectedId ? " on" : "")}
                    onClick={() => { handleSelect(d.id); setRailOpen(false); }}
                  >
                    <Avatar d={d} size={20} />
                    <span className="rmain">
                      <span className="rn">{d.name}</span>
                      <span className="rsub">{d.handle} · {d.city}</span>
                    </span>
                    <span className="rstars" title={seniority(d).tier}>{"★".repeat(seniority(d).rank)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* profile */}
      {selected && <Profile d={selected} onClose={() => handleSelect(null)} />}

      {/* controls */}
      <div className="controls panel">
        <button className="ctrl" title="Zoom out" aria-label="Zoom out" onClick={() => globeRef.current.zoomBy(0.85)}>–</button>
        <button className="ctrl" title="Zoom in" aria-label="Zoom in" onClick={() => globeRef.current.zoomBy(1.18)}>+</button>
        <button className={"ctrl wide" + (autoToggle ? " on" : "")} aria-pressed={autoToggle} aria-label="Toggle auto-rotation" onClick={() => setAutoToggle((v) => !v)}>
          ◐ spin
        </button>
        <button className="ctrl wide" aria-label="Reset view" onClick={() => { globeRef.current.reset(); setActiveCountry(null); }}>⟲ reset</button>
        <button className={"ctrl wide" + (copied ? " on" : "")} aria-label="Copy shareable link" onClick={share}>
          {copied ? "✓ copied" : "⤴ share"}
        </button>
      </div>

      <div className="hint">drag to rotate · scroll to zoom · <b>← →</b> browse devs · <b>click a pin</b> for the profile</div>

      <div className="legend panel">
        <div className="lg"><span className="sw" style={{ background: "var(--cyan)" }} />developer</div>
        <div className="lg"><span className="sw" style={{ background: "var(--teal)" }} />connection</div>
        <div className="lg"><span className="sw" style={{ background: "var(--amber)" }} />selected</div>
        <div className="lg"><span className="sw" style={{ background: "var(--magenta)" }} />you (GitHub)</div>
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
          <div style={{ color: "var(--green)" }}>loading {developers.length} developers ▓▓▓▓▓▓▓▓</div>
        </div>
      </div>
    </div>
  );
}
