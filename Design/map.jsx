// Stylized dark map view + a "satellite" earth-tone variant.
// Pure SVG so it stays sharp and matches the design system.

const { useMemo, useState, useRef, useEffect } = React;

// Deterministic pseudo-random for stable layouts
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function MapBase({ style = "dark" }) {
  const blocks = useMemo(() => {
    const rnd = mulberry32(7);
    const arr = [];
    // grid of "blocks" with jitter
    for (let i = 0; i < 120; i++) {
      const x = (i % 12) * 9 - 4 + rnd() * 2;
      const y = Math.floor(i / 12) * 11 - 4 + rnd() * 2;
      const w = 6 + rnd() * 3;
      const h = 7 + rnd() * 4;
      arr.push({ x, y, w, h, t: rnd() });
    }
    return arr;
  }, []);

  const buildings = useMemo(() => {
    const rnd = mulberry32(42);
    const arr = [];
    for (let i = 0; i < 380; i++) {
      const x = rnd() * 110 - 5;
      const y = rnd() * 110 - 5;
      const w = 0.6 + rnd() * 1.6;
      const h = 0.6 + rnd() * 1.6;
      arr.push({ x, y, w, h, t: rnd() });
    }
    return arr;
  }, []);

  const sat = style === "satellite";

  // tones differ per style
  const c = sat ? {
    bg: "#1a1611", block: "#2a221a", block2: "#352a1f",
    road: "#7a6a55", roadMajor: "#a89072",
    park: "#2b3a1f", water: "#1f3346",
    bldg: "rgba(255,210,150,0.06)", bldg2: "rgba(255,210,150,0.10)",
  } : {
    bg: "var(--map-bg)", block: "var(--map-block)", block2: "var(--map-block-2)",
    road: "var(--map-road)", roadMajor: "var(--map-road-major)",
    park: "var(--map-park)", water: "var(--map-water)",
    bldg: "rgba(245,240,232,0.05)", bldg2: "rgba(245,240,232,0.09)",
  };

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
      <defs>
        <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
          <stop offset="60%" stopColor="#000" stopOpacity="0"/>
          <stop offset="100%" stopColor="#000" stopOpacity={sat ? 0.55 : 0.5}/>
        </radialGradient>
        <pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill={sat ? "#3a2f22" : "#1a1f26"} fillOpacity="0.25"/>
        </pattern>
      </defs>

      <rect x="0" y="0" width="100" height="100" fill={c.bg}/>

      {/* Park (greenway) */}
      <path d="M 70 -2 Q 78 30 70 55 Q 62 78 78 102 L 102 102 L 102 -2 Z" fill={c.park}/>
      {/* Water inlet */}
      <path d="M -2 86 Q 18 80 30 88 Q 48 96 64 90 L 64 102 L -2 102 Z" fill={c.water}/>

      {/* Blocks (subtle ground colour variance) */}
      {blocks.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.t > 0.6 ? c.block2 : c.block} rx="0.4"/>
      ))}

      {/* Minor roads: vertical + horizontal grid */}
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={"v"+i} x1={i * 9 + 2} y1="-2" x2={i * 9 + 2} y2="102" stroke={c.road} strokeWidth="0.45" strokeOpacity={sat ? 0.5 : 0.7}/>
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <line key={"h"+i} x1="-2" y1={i * 11 + 3} x2="102" y2={i * 11 + 3} stroke={c.road} strokeWidth="0.45" strokeOpacity={sat ? 0.5 : 0.7}/>
      ))}

      {/* Major arterials */}
      <path d="M -2 50 Q 30 48 55 52 Q 80 56 102 50" fill="none" stroke={c.roadMajor} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M 25 -2 Q 28 30 30 50 Q 32 70 28 102" fill="none" stroke={c.roadMajor} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M 60 -2 Q 58 30 55 55 Q 52 80 58 102" fill="none" stroke={c.roadMajor} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M -2 18 Q 30 22 60 18 Q 85 14 102 22" fill="none" stroke={c.roadMajor} strokeWidth="1.0" strokeLinecap="round"/>
      <path d="M -2 78 Q 25 76 55 80 Q 80 84 102 78" fill="none" stroke={c.roadMajor} strokeWidth="1.0" strokeLinecap="round"/>

      {/* Buildings */}
      {buildings.map((b, i) => (
        <rect key={"b"+i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.t > 0.5 ? c.bldg2 : c.bldg}/>
      ))}

      {/* Subtle grain */}
      <rect x="0" y="0" width="100" height="100" fill="url(#grain)" opacity="0.5"/>
      {/* Vignette */}
      <rect x="0" y="0" width="100" height="100" fill="url(#vignette)"/>
    </svg>
  );
}

function ExistingStorePins({ brandMap }) {
  return EXISTING_STORES.map((s, i) => {
    const b = brandMap[s.brand];
    return (
      <div key={"ex" + i} style={{
        position: "absolute", left: `${s.x}%`, top: `${s.y}%`,
        transform: "translate(-50%, -50%)",
        width: 18, height: 18, borderRadius: 5,
        background: b?.color || "#888", color: b?.ink || "#000",
        display: "grid", placeItems: "center",
        fontFamily: "Geist Mono", fontSize: 9, fontWeight: 700,
        border: "1.5px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 10px rgba(0,0,0,0.6)",
      }}>{b?.glyph || "•"}</div>
    );
  });
}

function CompetitorPins() {
  return COMPETITORS.map((c, i) => (
    <div key={"cp" + i} style={{
      position: "absolute", left: `${c.x}%`, top: `${c.y}%`,
      transform: "translate(-50%, -50%)",
      width: 14, height: 14, borderRadius: 14,
      background: "rgba(20,20,20,0.85)", color: "rgba(255,255,255,0.55)",
      border: "1px dashed rgba(255,255,255,0.35)",
      display: "grid", placeItems: "center",
      fontFamily: "Geist Mono", fontSize: 7, fontWeight: 600, letterSpacing: 0.2,
    }} title={`Competitor: ${c.label}`}>{c.label}</div>
  ));
}

function SitePin({ site, selected, hovered, onClick, onHover, brandColor }) {
  const tierColor = site.tier === "A+" ? "var(--accent)" :
                    site.tier === "A"  ? "var(--accent)" :
                    "#c9a560";
  const ring = selected ? 3 : hovered ? 2 : 1.5;
  return (
    <div
      onClick={() => onClick(site)}
      onMouseEnter={() => onHover(site.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: "absolute", left: `${site.x}%`, top: `${site.y}%`,
        transform: `translate(-50%, -100%) translateY(-2px) scale(${selected ? 1.1 : 1})`,
        transition: "transform .18s ease",
        cursor: "pointer", zIndex: selected ? 30 : hovered ? 20 : 10,
      }}>
      {/* Pulse ring for top-tier */}
      {site.tier === "A+" && (
        <div style={{
          position: "absolute", left: "50%", bottom: -6,
          transform: "translateX(-50%)", width: 60, height: 60, borderRadius: 60,
          background: "radial-gradient(circle, rgba(245,165,36,0.25), transparent 60%)",
          animation: "pulse 2.4s ease-out infinite",
          pointerEvents: "none",
        }}/>
      )}
      <div style={{
        background: "var(--bg-1)", color: "var(--ink)",
        border: `${ring}px solid ${tierColor}`,
        borderRadius: 999, padding: "6px 10px 6px 8px",
        display: "flex", alignItems: "center", gap: 8,
        boxShadow: selected
          ? "0 14px 30px rgba(0,0,0,0.6), 0 0 0 4px rgba(245,165,36,0.15)"
          : "0 8px 18px rgba(0,0,0,0.55)",
        fontFamily: "Geist", fontSize: 11, fontWeight: 600,
        whiteSpace: "nowrap",
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 22,
          background: tierColor, color: "var(--accent-ink)",
          display: "grid", placeItems: "center",
          fontFamily: "Geist Mono", fontSize: 11, fontWeight: 700,
        }}>{site.score}</span>
        <span style={{ color: "var(--ink)" }}>{site.suburb}</span>
        <span className="mono" style={{ color: "var(--ink-3)", fontSize: 10 }}>{site.tier}</span>
      </div>
      {/* Stem */}
      <svg width="14" height="10" viewBox="0 0 14 10" style={{ display: "block", margin: "-1px auto 0" }}>
        <path d="M 0 0 L 14 0 L 7 10 Z" fill="var(--bg-1)" stroke={tierColor} strokeWidth="1.5"/>
      </svg>
    </div>
  );
}

function MapView({ sites, selectedId, hoveredId, onSelect, onHover, brand, mapStyle, showCompetitors, showExisting, showCatchment }) {
  const brandMap = Object.fromEntries(BRANDS.map(b => [b.id, b]));
  const selected = sites.find(s => s.id === selectedId);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "var(--map-bg)" }}>
      <MapBase style={mapStyle}/>

      {/* Catchment ring around selected */}
      {showCatchment && selected && (
        <>
          <div style={{
            position: "absolute", left: `${selected.x}%`, top: `${selected.y}%`,
            transform: "translate(-50%, -50%)",
            width: "26%", aspectRatio: "1/1", borderRadius: "50%",
            border: "1px dashed rgba(245,165,36,0.55)",
            background: "radial-gradient(circle, rgba(245,165,36,0.10), rgba(245,165,36,0) 70%)",
            pointerEvents: "none",
          }}/>
          <div style={{
            position: "absolute", left: `${selected.x}%`, top: `${selected.y}%`,
            transform: "translate(-50%, -50%)",
            width: "14%", aspectRatio: "1/1", borderRadius: "50%",
            border: "1px dashed rgba(245,165,36,0.75)",
            pointerEvents: "none",
          }}/>
          <div style={{
            position: "absolute", left: `${selected.x}%`, top: `${selected.y - 13}%`,
            transform: "translate(-50%, -50%)",
            fontFamily: "Geist Mono", fontSize: 10, color: "rgba(245,165,36,0.9)",
            background: "rgba(20,16,10,0.85)", padding: "2px 6px", borderRadius: 4,
            border: "1px solid rgba(245,165,36,0.4)",
            pointerEvents: "none", whiteSpace: "nowrap",
          }}>5-min drive · 142k</div>
        </>
      )}

      {/* Existing stores */}
      {showExisting && <ExistingStorePins brandMap={brandMap}/>}

      {/* Competitors */}
      {showCompetitors && <CompetitorPins/>}

      {/* Site pins */}
      {sites.map(s => (
        <SitePin key={s.id} site={s} selected={s.id === selectedId} hovered={s.id === hoveredId} onClick={onSelect} onHover={onHover} brandColor={brand.color}/>
      ))}

      {/* Crosshair (center) */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "grid", placeItems: "center" }}>
        <div style={{ width: 14, height: 14, border: "1px solid rgba(245,240,232,0.18)", borderRadius: 14, position: "relative" }}>
          <span style={{ position: "absolute", left: "50%", top: -6, bottom: -6, width: 1, background: "rgba(245,240,232,0.18)" }}/>
          <span style={{ position: "absolute", top: "50%", left: -6, right: -6, height: 1, background: "rgba(245,240,232,0.18)" }}/>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%   { transform: translateX(-50%) scale(0.6); opacity: 0.9; }
          100% { transform: translateX(-50%) scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

window.MapView = MapView;
