// Main app — orchestrates state and lays out the three regions + map chrome.

const { useState: useStateApp, useMemo: useMemoApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "mapStyle": "dark",
  "density": "comfortable",
  "showExisting": true,
  "showCompetitors": true,
  "showCatchment": true,
  "accent": "#f5a524"
}/*EDITMODE-END*/;

const ACCENT_PRESETS = {
  "#f5a524": { a: "#f5a524", b: "#ff7a1a", ink: "#1a1208" },  // amber
  "#e14a3d": { a: "#e14a3d", b: "#c2241a", ink: "#fff"    },  // ruby
  "#7cba5a": { a: "#7cba5a", b: "#3f8a4a", ink: "#0d1808" },  // forest
};

function MapControl({ icon, label, active, onClick, kbd }) {
  return (
    <button onClick={onClick} title={label} style={{
      width: 36, height: 36, borderRadius: 9,
      background: active ? "var(--accent)" : "rgba(20,18,16,0.85)",
      color: active ? "var(--accent-ink)" : "var(--ink-2)",
      border: `1px solid ${active ? "var(--accent)" : "var(--line-2)"}`,
      backdropFilter: "blur(8px)",
      display: "grid", placeItems: "center",
      cursor: "pointer",
    }}>
      <Icon name={icon} size={15}/>
    </button>
  );
}

function MapToolbar({ mapStyle, setMapStyle, layers, setLayers, brand }) {
  return (
    <>
      {/* Top-left address breadcrumb */}
      <div style={{
        position: "absolute", left: 16, top: 16, zIndex: 30,
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px 8px 10px",
        background: "rgba(20,18,16,0.85)",
        border: "1px solid var(--line-2)", borderRadius: 10,
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      }}>
        <Icon name="map" size={14} style={{ color: "var(--ink-3)" }}/>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Johannesburg ›</span>
        <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 600 }}>Sandton &amp; Rosebank corridor</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 8, borderLeft: "1px solid var(--line-2)", paddingLeft: 10 }}>
          −26.1076° 28.0567°
        </span>
      </div>

      {/* Right column: layer toggles + zoom */}
      <div style={{
        position: "absolute", right: 16, top: 70, zIndex: 30,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{
          display: "flex", flexDirection: "column", gap: 2, padding: 4,
          background: "rgba(20,18,16,0.85)",
          border: "1px solid var(--line-2)", borderRadius: 10,
          backdropFilter: "blur(8px)",
        }}>
          <MapControl icon="layers" active={mapStyle === "dark"} onClick={() => setMapStyle("dark")} label="Dark map"/>
          <MapControl icon="map" active={mapStyle === "satellite"} onClick={() => setMapStyle("satellite")} label="Satellite"/>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", gap: 2, padding: 4,
          background: "rgba(20,18,16,0.85)",
          border: "1px solid var(--line-2)", borderRadius: 10,
          backdropFilter: "blur(8px)",
        }}>
          <MapControl icon="store" active={layers.showExisting} onClick={() => setLayers({ ...layers, showExisting: !layers.showExisting })} label="Existing stores"/>
          <MapControl icon="users" active={layers.showCompetitors} onClick={() => setLayers({ ...layers, showCompetitors: !layers.showCompetitors })} label="Competitors"/>
          <MapControl icon="target" active={layers.showCatchment} onClick={() => setLayers({ ...layers, showCatchment: !layers.showCatchment })} label="Catchment ring"/>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", gap: 2, padding: 4,
          background: "rgba(20,18,16,0.85)",
          border: "1px solid var(--line-2)", borderRadius: 10,
          backdropFilter: "blur(8px)",
        }}>
          <MapControl icon="plus" label="Zoom in"/>
          <MapControl icon="crosshair" label="Recenter"/>
        </div>
      </div>

      {/* Bottom-left map legend */}
      <div style={{
        position: "absolute", left: 16, bottom: 16, zIndex: 30,
        background: "rgba(20,18,16,0.85)",
        border: "1px solid var(--line-2)", borderRadius: 10,
        backdropFilter: "blur(8px)",
        padding: "10px 12px",
        fontSize: 11, color: "var(--ink-2)",
        display: "flex", flexDirection: "column", gap: 5,
        minWidth: 180,
      }}>
        <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Legend</div>
        <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 14, border: "2px solid var(--accent)", background: "var(--bg-1)" }}/>} label="Candidate site"/>
        <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 4, background: brand.color, border: "1.5px solid #fff", color: brand.ink, fontSize: 8, fontWeight: 700, display: "grid", placeItems: "center", fontFamily: "Geist Mono" }}>{brand.glyph}</div>} label={`Existing ${brand.name}`}/>
        <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.4)", background: "rgba(20,20,20,0.85)" }}/>} label="Competitor (QSR)"/>
        <LegendRow swatch={<div style={{ width: 14, height: 14, borderRadius: 14, border: "1px dashed var(--accent)", background: "transparent" }}/>} label="5-min trade area"/>
      </div>

      {/* Bottom-right scale */}
      <div style={{
        position: "absolute", right: 16, bottom: 16, zIndex: 30,
        fontSize: 10, color: "var(--ink-3)", fontFamily: "Geist Mono",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span>500m</span>
        <div style={{ display: "flex", height: 6 }}>
          <div style={{ width: 24, background: "var(--ink-3)", borderLeft: "1px solid var(--ink-3)" }}/>
          <div style={{ width: 24, background: "transparent", borderRight: "1px solid var(--ink-3)", borderTop: "1px solid var(--ink-3)", borderBottom: "1px solid var(--ink-3)" }}/>
          <div style={{ width: 24, background: "var(--ink-3)" }}/>
        </div>
      </div>
    </>
  );
}

function LegendRow({ swatch, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {swatch} <span>{label}</span>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply accent CSS vars from preset
  const accent = ACCENT_PRESETS[String(t.accent).toLowerCase()] || ACCENT_PRESETS["#f5a524"];
  React.useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--accent", accent.a);
    r.setProperty("--accent-2", accent.b);
    r.setProperty("--accent-ink", accent.ink);
  }, [accent.a, accent.b, accent.ink]);

  const [brand, setBrand] = useStateApp(BRANDS[0]);
  const [selectedId, setSelectedId] = useStateApp("S-121");
  const [hoveredId, setHoveredId] = useStateApp(null);
  const [query, setQuery] = useStateApp("");
  const [filters, setFilters] = useStateApp({ tier: false, drive: false, cannibal: false, rent: false });
  const [assistantOpen, setAssistantOpen] = useStateApp(true);

  const filtered = useMemoApp(() => {
    return SITES.filter(s => {
      if (filters.tier && s.tier !== "A+") return false;
      if (filters.drive && !/drive/i.test(s.format)) return false;
      if (filters.cannibal && s.cannibal > 1.5) return false;
      if (filters.rent && s.rent >= 300) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!s.suburb.toLowerCase().includes(q) &&
            !s.address.toLowerCase().includes(q) &&
            !s.code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [filters, query]);

  const selectedSite = SITES.find(s => s.id === selectedId);

  const tweaksUI = (
    <>
      <TweakSection label="Layout">
        <TweakRadio
          label="Card density"
          value={t.density}
          options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Roomy" }]}
          onChange={(v) => setTweak("density", v)}
        />
      </TweakSection>
      <TweakSection label="Map">
        <TweakRadio
          label="Style"
          value={t.mapStyle}
          options={[{ value: "dark", label: "Dark" }, { value: "satellite", label: "Satellite" }]}
          onChange={(v) => setTweak("mapStyle", v)}
        />
        <TweakToggle label="Existing stores" value={t.showExisting} onChange={(v) => setTweak("showExisting", v)}/>
        <TweakToggle label="Competitors"     value={t.showCompetitors} onChange={(v) => setTweak("showCompetitors", v)}/>
        <TweakToggle label="Catchment ring"  value={t.showCatchment} onChange={(v) => setTweak("showCatchment", v)}/>
      </TweakSection>
      <TweakSection label="Accent">
        <TweakColor
          label="Palette"
          value={t.accent}
          options={["#f5a524", "#e14a3d", "#7cba5a"]}
          onChange={(v) => setTweak("accent", v)}
        />
      </TweakSection>
    </>
  );

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", background: "var(--bg)" }}>
      <Sidebar
        brand={brand} setBrand={setBrand}
        sites={filtered} allSites={SITES}
        selectedId={selectedId} hoveredId={hoveredId}
        onSelect={(s) => setSelectedId(s.id)}
        onHover={setHoveredId}
        filters={filters} setFilters={setFilters}
        density={t.density}
        query={query} setQuery={setQuery}
      />

      <main style={{ flex: 1, position: "relative", minWidth: 0, background: "var(--map-bg)" }}>
        <MapView
          sites={filtered}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={(s) => setSelectedId(s.id)}
          onHover={setHoveredId}
          brand={brand}
          mapStyle={t.mapStyle}
          showExisting={t.showExisting}
          showCompetitors={t.showCompetitors}
          showCatchment={t.showCatchment}
        />

        <MapToolbar
          mapStyle={t.mapStyle} setMapStyle={(v) => setTweak("mapStyle", v)}
          layers={{ showExisting: t.showExisting, showCompetitors: t.showCompetitors, showCatchment: t.showCatchment }}
          setLayers={(L) => setTweak(L)}
          brand={brand}
        />

        <Detail site={selectedSite} onClose={() => setSelectedId(null)} onCompare={() => {}}/>

        {!assistantOpen && (
          <button onClick={() => setAssistantOpen(true)} style={{
            position: "absolute", right: 16, top: 16, zIndex: 60,
            background: "var(--bg-1)", border: "1px solid var(--line)",
            color: "var(--ink)", borderRadius: 12, padding: "10px 14px 10px 10px",
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: 22,
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              display: "grid", placeItems: "center", color: "var(--accent-ink)",
            }}><Icon name="sparkle" size={12} stroke={2.2}/></span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Planner AI</span>
          </button>
        )}
      </main>

      {assistantOpen && (
        <Assistant
          collapsed={false}
          onToggle={() => setAssistantOpen(false)}
          onRefClick={(s) => setSelectedId(s.id)}
          selectedSite={selectedSite}
          brand={brand}
        />
      )}

      <TweaksPanel title="Tweaks">
        {tweaksUI}
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
