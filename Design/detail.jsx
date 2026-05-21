// Site detail card — slides up from bottom of map area when a site is selected.

const { useEffect: useEffectD } = React;

function Stat({ label, value, sub, tone = "default" }) {
  const colorMap = {
    default: "var(--ink)", good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", accent: "var(--accent)",
  };
  return (
    <div style={{ padding: "12px 14px", borderRight: "1px solid var(--line)", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: colorMap[tone], marginTop: 4, lineHeight: 1.1, letterSpacing: -0.4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Mini sparkline / bar
function MiniBars({ values, color = "var(--accent)" }) {
  const max = Math.max(...values);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24 }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${(v / max) * 100}%`,
          background: color,
          opacity: 0.4 + (i / values.length) * 0.6,
          borderRadius: 1,
        }}/>
      ))}
    </div>
  );
}

function PhotoPlaceholder({ style, label }) {
  // Stylised "site photo" — gradient + glyphs, no real image
  const gradients = [
    "linear-gradient(135deg, #3a2820, #6b4a32)",
    "linear-gradient(135deg, #2b3a45, #4a6173)",
    "linear-gradient(135deg, #4a3320, #8a5a30)",
    "linear-gradient(135deg, #353a30, #5a6648)",
    "linear-gradient(135deg, #45302a, #7a4d3f)",
    "linear-gradient(135deg, #2e3848, #4f5d72)",
    "linear-gradient(135deg, #3a2a35, #6b4858)",
    "linear-gradient(135deg, #2f3a35, #56725c)",
  ];
  return (
    <div style={{
      flex: 1, minWidth: 0,
      borderRadius: 10, overflow: "hidden", position: "relative",
      background: gradients[(style - 1) % gradients.length],
      border: "1px solid var(--line)",
    }}>
      {/* fake architectural lines */}
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path d="M 10 60 L 10 30 L 35 25 L 35 60 Z" fill="rgba(0,0,0,0.35)"/>
        <path d="M 35 60 L 35 22 L 55 18 L 55 60 Z" fill="rgba(0,0,0,0.50)"/>
        <path d="M 55 60 L 55 28 L 80 32 L 80 60 Z" fill="rgba(0,0,0,0.40)"/>
        <path d="M 0 60 L 100 60 L 100 56 L 0 58 Z" fill="rgba(0,0,0,0.6)"/>
        {/* "windows" */}
        {[...Array(8)].map((_, i) => (
          <rect key={i} x={12 + (i % 4) * 5} y={32 + Math.floor(i / 4) * 5} width="3" height="3" fill="rgba(255,220,170,0.35)"/>
        ))}
      </svg>
      <div style={{
        position: "absolute", left: 8, bottom: 8, fontSize: 10,
        color: "rgba(255,255,255,0.7)", fontFamily: "Geist Mono",
        background: "rgba(0,0,0,0.5)", padding: "2px 6px", borderRadius: 4,
        backdropFilter: "blur(4px)",
      }}>{label}</div>
    </div>
  );
}

function Detail({ site, onClose, onCompare }) {
  if (!site) return null;
  const tierColor = site.tier === "A+" ? "var(--accent)" : site.tier === "A" ? "var(--accent)" : "#c9a560";

  // Mock weekly traffic pattern
  const weekFoot = [0.7, 0.75, 0.8, 0.85, 1.0, 0.95, 0.6].map(x => x * site.foot);

  return (
    <div style={{
      position: "absolute", left: 16, right: 16, bottom: 16, zIndex: 40,
      background: "rgba(20, 18, 16, 0.92)",
      backdropFilter: "blur(20px)",
      border: "1px solid var(--line-2)",
      borderRadius: 16,
      boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
      animation: "slideUp .26s cubic-bezier(.2,.8,.2,1)",
      overflow: "hidden",
    }}>
      {/* Header strip */}
      <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: tierColor, color: "var(--accent-ink)",
          display: "grid", placeItems: "center",
          fontFamily: "Geist Mono", fontSize: 22, fontWeight: 700,
          letterSpacing: -1,
        }}>{site.score}</div>
        <div style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{site.name}</span>
            <span className="mono" style={{
              fontSize: 11, fontWeight: 700, color: tierColor,
              border: `1px solid ${tierColor}`, borderRadius: 4, padding: "1px 5px",
            }}>{site.tier}</span>
            <span style={{
              fontSize: 11, color: "var(--ink-2)",
              background: "var(--bg-3)", border: "1px solid var(--line)",
              borderRadius: 4, padding: "1px 6px",
            }}>{site.format}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
            <span className="mono">{site.code}</span> · {site.address}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onCompare} style={{ ...iconBtn, height: 32, padding: "0 12px", fontSize: 12, gap: 6, display: "inline-flex", alignItems: "center" }}>
            <Icon name="compare" size={13}/> Compare
          </button>
          <button style={{ ...iconBtn, height: 32, padding: "0 12px", fontSize: 12, gap: 6, display: "inline-flex", alignItems: "center" }}>
            <Icon name="bookmark" size={13}/> Shortlist
          </button>
          <button style={{
            height: 32, padding: "0 14px",
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: "var(--accent-ink)", border: "none", borderRadius: 8,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            Open dossier <Icon name="chevron" size={12}/>
          </button>
          <button onClick={onClose} style={{ ...iconBtn, height: 32 }}><Icon name="close" size={14}/></button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
        <Stat label="Catchment pop." value={`${(site.catchment.pop/1000).toFixed(0)}k`} sub="5-min drive"/>
        <Stat label="Median HHI" value={`R${(site.catchment.hhi/1000).toFixed(0)}k`} sub={`age ${site.catchment.age}`}/>
        <Stat label="Foot traffic" value={`${(site.foot/1000).toFixed(1)}k`} sub="daily avg"/>
        <Stat label="Vehicle" value={`${(site.vehicle/1000).toFixed(1)}k`} sub="daily avg"/>
        <Stat label="Rent" value={`R${site.rent}`} sub="per m² · gross"/>
        <Stat label="GLA" value={`${site.gla}m²`} sub="leasable"/>
        <Stat
          label="Cannibalisation"
          value={`${site.cannibal.toFixed(1)}×`}
          sub={site.cannibal > 2 ? "high risk" : site.cannibal > 1 ? "moderate" : "low"}
          tone={site.cannibal > 2 ? "bad" : site.cannibal > 1 ? "warn" : "good"}
        />
        <div style={{ padding: "12px 14px", flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 }}>Foot · 7 days</div>
          <MiniBars values={weekFoot} color={tierColor}/>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--ink-4)", marginTop: 2, fontFamily: "Geist Mono" }}>
            <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
          </div>
        </div>
      </div>

      {/* Lower row: photo, AI take, score breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 280px", gap: 0 }}>
        {/* Photo */}
        <div style={{ padding: 14, display: "flex", borderRight: "1px solid var(--line)" }}>
          <PhotoPlaceholder style={site.photoStyle} label="Street view"/>
        </div>

        {/* AI take */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{
              width: 18, height: 18, borderRadius: 18,
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              display: "grid", placeItems: "center", color: "var(--accent-ink)",
            }}><Icon name="sparkle" size={10} stroke={2.4}/></span>
            <span style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 1 }}>Planner take</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)" }}>
            {site.notes}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {["Generate LOI", "Add to weekly memo", "Schedule visit"].map(c => (
              <button key={c} style={{
                background: "transparent", border: "1px solid var(--line-2)",
                borderRadius: 999, padding: "4px 10px",
                color: "var(--ink-2)", cursor: "pointer", fontSize: 11,
              }}>{c}</button>
            ))}
          </div>
        </div>

        {/* Score breakdown */}
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Score breakdown</div>
          {[
            { l: "Catchment depth", v: 92 },
            { l: "Visibility & access", v: 88 },
            { l: "Brand fit", v: 95 },
            { l: "Cannibalisation",  v: 100 - Math.min(95, site.cannibal * 30) },
            { l: "Cost yield",       v: Math.max(40, 100 - site.rent / 5) },
          ].map(row => (
            <div key={row.l} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--ink-2)", flex: 1 }}>{row.l}</span>
              <div style={{ width: 110, height: 4, background: "var(--bg-3)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${row.v}%`, height: "100%", background: tierColor, borderRadius: 4 }}/>
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink)", minWidth: 24, textAlign: "right" }}>
                {Math.round(row.v)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

window.Detail = Detail;
