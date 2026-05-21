// Left sidebar: header, brand picker, search/filters, site list

const { useState: useStateS } = React;

function BrandChip({ brand, selected, onClick }) {
  return (
    <button onClick={() => onClick(brand)} style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 10px 6px 6px",
      borderRadius: 999,
      background: selected ? "var(--bg-3)" : "transparent",
      border: selected ? "1px solid var(--line-2)" : "1px solid var(--line)",
      color: "var(--ink)", cursor: "pointer",
      fontFamily: "Geist", fontSize: 12, fontWeight: 500,
      transition: "all .15s ease",
      whiteSpace: "nowrap",
    }}
    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--bg-2)"; }}
    onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 22,
        background: brand.color, color: brand.ink,
        display: "grid", placeItems: "center",
        fontFamily: "Geist", fontSize: 11, fontWeight: 700,
        letterSpacing: -0.3,
      }}>{brand.glyph}</span>
      {brand.name}
      {selected && (
        <span className="mono" style={{ color: "var(--ink-3)", fontSize: 10, marginLeft: 2 }}>
          {brand.count}
        </span>
      )}
    </button>
  );
}

function ScoreBar({ value, color = "var(--accent)" }) {
  return (
    <div style={{ height: 4, borderRadius: 4, background: "var(--bg-3)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 4 }}/>
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    new:         { c: "var(--accent)",     l: "New" },
    shortlisted: { c: "var(--good)",       l: "Shortlisted" },
    watch:       { c: "var(--ink-3)",      l: "Watching" },
  };
  const s = map[status] || map.new;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)", fontSize: 11 }}>
      <span style={{ width: 6, height: 6, borderRadius: 6, background: s.c }}/>
      {s.l}
    </span>
  );
}

function SiteCard({ site, selected, onClick, onHover, density }) {
  const tierColor = site.tier === "A+" ? "var(--accent)" : site.tier === "A" ? "var(--accent)" : "#c9a560";
  return (
    <button
      onClick={() => onClick(site)}
      onMouseEnter={() => onHover(site.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        textAlign: "left", width: "100%",
        background: selected ? "var(--bg-2)" : "var(--bg-1)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
        borderRadius: 12, padding: density === "compact" ? "10px 12px" : "14px",
        cursor: "pointer", color: "var(--ink)",
        display: "block", transition: "border-color .15s ease, background .15s ease",
        boxShadow: selected ? "0 0 0 3px rgba(245,165,36,0.10)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: 0.5 }}>{site.code}</span>
        <StatusDot status={site.status}/>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: tierColor, color: "var(--accent-ink)",
          display: "grid", placeItems: "center",
          fontFamily: "Geist Mono", fontSize: 16, fontWeight: 700,
          flexShrink: 0,
        }}>{site.score}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{site.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{site.address}</div>
        </div>
        <div className="mono" style={{
          fontSize: 11, fontWeight: 700, color: tierColor,
          border: `1px solid ${tierColor}`, borderRadius: 4, padding: "1px 5px",
        }}>{site.tier}</div>
      </div>
      {density !== "compact" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Rent</div>
              <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>R{site.rent}<span style={{ color: "var(--ink-3)", fontSize: 10 }}>/m²</span></div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Foot</div>
              <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>{(site.foot/1000).toFixed(1)}k<span style={{ color: "var(--ink-3)", fontSize: 10 }}>/d</span></div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>HHI</div>
              <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>R{(site.catchment.hhi/1000).toFixed(0)}k</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <ScoreBar value={site.score} color={tierColor}/>
          </div>
        </>
      )}
    </button>
  );
}

function Sidebar({ brand, setBrand, sites, allSites, selectedId, hoveredId, onSelect, onHover, filters, setFilters, density, query, setQuery }) {
  const sortOptions = ["Score", "Rent ↑", "Foot ↓", "Distance"];
  const [sort, setSort] = useStateS("Score");

  return (
    <aside style={{
      width: 380, height: "100%",
      background: "var(--bg-1)",
      borderRight: "1px solid var(--line)",
      display: "flex", flexDirection: "column",
      flexShrink: 0,
    }}>
      {/* Brand bar */}
      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              display: "grid", placeItems: "center",
              color: "var(--accent-ink)", fontFamily: "Geist", fontWeight: 700, fontSize: 13,
            }}>FB</div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: 1.2, textTransform: "uppercase" }}>Famous Brands</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: -1 }}>Site Planner</div>
            </div>
          </div>
          <button style={iconBtn}><Icon name="settings" size={15}/></button>
        </div>
      </div>

      {/* Brand picker */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Planning for</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {BRANDS.slice(0, 5).map(b => (
            <BrandChip key={b.id} brand={b} selected={b.id === brand.id} onClick={setBrand}/>
          ))}
          <button style={{
            ...iconBtn, height: 32, padding: "0 10px", borderRadius: 999, fontSize: 12,
            color: "var(--ink-3)",
          }}>+3 more</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg-2)", border: "1px solid var(--line-2)",
          borderRadius: 10, padding: "8px 10px",
        }}>
          <Icon name="search" size={15} style={{ color: "var(--ink-3)" }}/>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search suburb, address or site code…"
            style={{
              background: "transparent", border: "none", outline: "none",
              color: "var(--ink)", fontSize: 13, flex: 1, padding: 0,
            }}/>
          <kbd className="mono" style={{
            fontSize: 10, color: "var(--ink-3)",
            background: "var(--bg-3)", border: "1px solid var(--line-2)",
            padding: "1px 5px", borderRadius: 4,
          }}>⌘K</kbd>
        </div>

        {/* Quick filters */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { k: "tier", l: "A+ only" },
            { k: "drive", l: "Drive-thru" },
            { k: "cannibal", l: "Low cannibalisation" },
            { k: "rent", l: "Rent < R300" },
          ].map(f => (
            <button key={f.k} onClick={() => setFilters({ ...filters, [f.k]: !filters[f.k] })} style={{
              fontSize: 11, fontWeight: 500,
              padding: "4px 9px", borderRadius: 999,
              background: filters[f.k] ? "rgba(245,165,36,0.14)" : "var(--bg-2)",
              border: `1px solid ${filters[f.k] ? "var(--accent)" : "var(--line)"}`,
              color: filters[f.k] ? "var(--accent)" : "var(--ink-2)",
              cursor: "pointer",
            }}>{f.l}</button>
          ))}
        </div>
      </div>

      {/* Sort/count */}
      <div style={{ padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{sites.length}</span> candidate{sites.length === 1 ? "" : "s"} · <span className="mono">Sandton</span>
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{
            background: "var(--bg-2)", border: "1px solid var(--line)",
            color: "var(--ink)", fontSize: 11, padding: "3px 6px", borderRadius: 6,
            fontFamily: "inherit",
          }}>
            {sortOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {sites.map(s => (
          <SiteCard key={s.id} site={s} selected={s.id === selectedId} onClick={onSelect} onHover={onHover} density={density}/>
        ))}
        {sites.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No sites match those filters.
          </div>
        )}
      </div>
    </aside>
  );
}

const iconBtn = {
  background: "var(--bg-2)", border: "1px solid var(--line)",
  borderRadius: 8, padding: 6, color: "var(--ink-2)",
  cursor: "pointer", display: "inline-grid", placeItems: "center",
  height: 28, transition: "all .15s ease",
};

window.Sidebar = Sidebar;
window.iconBtn = iconBtn;
