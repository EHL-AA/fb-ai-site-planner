// Right rail: AI assistant — chat + structured replies referencing sites

const { useState: useStateA, useRef: useRefA, useEffect: useEffectA } = React;

const SEED_THREAD = [
  { role: "system", t: "Studying Steers' Sandton footprint · 4 existing stores, 8 candidates surfaced." },
  { role: "user", t: "Which Sandton sites give Steers the best ATV uplift without cannibalising Morningside?" },
  {
    role: "ai",
    t: "Three sites sit in your sweet spot. Rosebank Link is the clear A+ — heavy Gautrain catchment, late-night skew. Rivonia Village trades lower rent for solid family traffic. Avoid Sandton Central — 3.4× cannibalisation against your existing Maude St store.",
    refs: ["S-121", "S-118", "S-129"],
    chips: ["See trade area", "Compare top 3", "Draft LOI"],
  },
];

function Msg({ m, onRef }) {
  if (m.role === "system") {
    return (
      <div style={{
        fontSize: 11, color: "var(--ink-3)",
        padding: "6px 10px", borderRadius: 6,
        background: "var(--bg-2)", border: "1px dashed var(--line-2)",
        display: "inline-flex", alignItems: "center", gap: 6,
        alignSelf: "flex-start",
      }}>
        <Icon name="sparkle" size={11} style={{ color: "var(--accent)" }}/>
        {m.t}
      </div>
    );
  }
  if (m.role === "user") {
    return (
      <div style={{
        alignSelf: "flex-end", maxWidth: "90%",
        background: "var(--bg-3)", border: "1px solid var(--line-2)",
        color: "var(--ink)", fontSize: 13, lineHeight: 1.5,
        padding: "10px 12px", borderRadius: "14px 14px 4px 14px",
      }}>{m.t}</div>
    );
  }
  // ai
  return (
    <div style={{
      alignSelf: "flex-start", maxWidth: "100%",
      display: "flex", gap: 10,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 24, flexShrink: 0,
        background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
        display: "grid", placeItems: "center", color: "var(--accent-ink)",
      }}>
        <Icon name="sparkle" size={13} stroke={2.2}/>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>{m.t}</div>
        {m.refs && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {m.refs.map(r => {
              const site = SITES.find(s => s.id === r);
              if (!site) return null;
              const tierColor = site.tier === "A+" ? "var(--accent)" : "#c9a560";
              return (
                <button key={r} onClick={() => onRef(site)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "var(--bg-2)", border: "1px solid var(--line-2)",
                  borderRadius: 8, padding: "5px 9px 5px 6px",
                  color: "var(--ink)", cursor: "pointer", fontSize: 12,
                  fontFamily: "inherit",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5,
                    background: tierColor, color: "var(--accent-ink)",
                    display: "grid", placeItems: "center",
                    fontFamily: "Geist Mono", fontSize: 10, fontWeight: 700,
                  }}>{site.score}</span>
                  {site.suburb}
                  <Icon name="chevron" size={11} style={{ color: "var(--ink-3)" }}/>
                </button>
              );
            })}
          </div>
        )}
        {m.chips && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {m.chips.map(c => (
              <button key={c} style={{
                background: "transparent", border: "1px solid var(--line-2)",
                borderRadius: 999, padding: "4px 10px",
                color: "var(--ink-2)", cursor: "pointer", fontSize: 11,
                fontFamily: "inherit",
              }}>{c}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Assistant({ collapsed, onToggle, onRefClick, selectedSite, brand }) {
  const [thread, setThread] = useStateA(SEED_THREAD);
  const [input, setInput] = useStateA("");
  const [busy, setBusy] = useStateA(false);
  const scrollerRef = useRefA(null);

  useEffectA(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [thread]);

  const send = (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    const next = [...thread, { role: "user", t: q }];
    setThread(next);
    setInput("");
    setBusy(true);

    // Mock AI response
    setTimeout(() => {
      const reply = mockReply(q);
      setThread(t => [...t, reply]);
      setBusy(false);
    }, 900);
  };

  if (collapsed) {
    return (
      <button onClick={onToggle} style={{
        position: "absolute", right: 16, top: 16, zIndex: 60,
        background: "var(--bg-1)", border: "1px solid var(--line)",
        color: "var(--ink)", borderRadius: 12, padding: "10px 14px 10px 12px",
        display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 22,
          background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
          display: "grid", placeItems: "center", color: "var(--accent-ink)",
        }}><Icon name="sparkle" size={12} stroke={2.2}/></span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Ask the planner</span>
        <span className="mono" style={{
          fontSize: 10, color: "var(--ink-3)",
          background: "var(--bg-3)", border: "1px solid var(--line-2)",
          padding: "1px 5px", borderRadius: 4,
        }}>⌘J</span>
      </button>
    );
  }

  return (
    <aside style={{
      width: 380, height: "100%",
      background: "var(--bg-1)", borderLeft: "1px solid var(--line)",
      display: "flex", flexDirection: "column", flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px", borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 28,
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            display: "grid", placeItems: "center", color: "var(--accent-ink)",
          }}><Icon name="sparkle" size={14} stroke={2.2}/></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              Planner AI
              <span style={{
                fontSize: 10, color: "var(--good)",
                background: "rgba(109,213,140,0.10)", border: "1px solid rgba(109,213,140,0.3)",
                borderRadius: 999, padding: "1px 6px",
              }}>● Live</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: -1 }}>
              {brand.name} · Sandton · 8 sites
            </div>
          </div>
        </div>
        <button onClick={onToggle} style={iconBtn} aria-label="Close"><Icon name="close" size={14}/></button>
      </div>

      {/* Context bar */}
      {selectedSite && (
        <div style={{
          padding: "10px 16px", borderBottom: "1px solid var(--line)",
          background: "var(--bg-2)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Icon name="target" size={14} style={{ color: "var(--accent)" }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Discussing</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedSite.name}</div>
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{selectedSite.code}</span>
        </div>
      )}

      {/* Thread */}
      <div ref={scrollerRef} style={{
        flex: 1, overflowY: "auto", padding: "16px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {thread.map((m, i) => <Msg key={i} m={m} onRef={onRefClick}/>)}
        {busy && (
          <div style={{ display: "flex", gap: 10, alignSelf: "flex-start", alignItems: "center" }}>
            <span style={{
              width: 24, height: 24, borderRadius: 24,
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              display: "grid", placeItems: "center", color: "var(--accent-ink)",
            }}><Icon name="sparkle" size={13} stroke={2.2}/></span>
            <div style={{ display: "inline-flex", gap: 4, padding: "8px 10px", background: "var(--bg-2)", borderRadius: 12 }}>
              <span className="bounce-dot" style={{ animationDelay: "0s" }}/>
              <span className="bounce-dot" style={{ animationDelay: ".15s" }}/>
              <span className="bounce-dot" style={{ animationDelay: ".3s" }}/>
            </div>
          </div>
        )}
      </div>

      {/* Suggested prompts */}
      <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["Compare top 3", "Cannibalisation risk", "Rent vs score"].map(p => (
          <button key={p} onClick={() => send(p)} style={{
            background: "transparent", border: "1px solid var(--line)",
            borderRadius: 999, padding: "5px 11px",
            color: "var(--ink-2)", cursor: "pointer", fontSize: 11,
            fontFamily: "inherit",
          }}>{p}</button>
        ))}
      </div>

      {/* Composer */}
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--line)" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg-2)", border: "1px solid var(--line-2)",
          borderRadius: 12, padding: "6px 6px 6px 12px",
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about catchments, rent, brand fit…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--ink)", fontSize: 13, padding: "6px 0",
            }}/>
          <button onClick={() => send()} style={{
            background: input.trim() ? "linear-gradient(135deg, var(--accent), var(--accent-2))" : "var(--bg-3)",
            border: "none", borderRadius: 8, padding: "7px 10px",
            color: input.trim() ? "var(--accent-ink)" : "var(--ink-3)",
            cursor: "pointer", display: "inline-grid", placeItems: "center",
          }} aria-label="Send"><Icon name="send" size={13} stroke={2.2}/></button>
        </div>
      </div>

      <style>{`
        .bounce-dot {
          width: 6px; height: 6px; border-radius: 6px;
          background: var(--accent);
          animation: bounce 1.1s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: .4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </aside>
  );
}

function mockReply(q) {
  const lower = q.toLowerCase();
  if (lower.includes("compare") || lower.includes("top")) {
    return {
      role: "ai",
      t: "Stacked top three: Rosebank Link wins on catchment depth but rent is 38% above Rivonia. Morningside is the safe operator — proven Sandton Drive corridor. Open compare view to see ATV projections side-by-side.",
      refs: ["S-121", "S-118", "S-114"],
      chips: ["Open compare view", "Pin to shortlist"],
    };
  }
  if (lower.includes("cannibal")) {
    return {
      role: "ai",
      t: "Sandton Central (S-129) reads 3.4× — your Maude St store would absorb ~32% of new visits. Morningside and Bryanston West stay below 1.3×. Hyde Park borders Rosebank Link's catchment by ~600m; worth a sensitivity check.",
      refs: ["S-129", "S-121"],
      chips: ["Run sensitivity", "Exclude high-cannibal"],
    };
  }
  if (lower.includes("rent")) {
    return {
      role: "ai",
      t: "Best rent-to-score yield: Rivonia Village at R245/m² for a score of 87 — that's R2.82/score-point. Parkmore Strip is even cheaper but the score caps at 68.",
      refs: ["S-118", "S-142"],
      chips: ["Plot yield curve"],
    };
  }
  return {
    role: "ai",
    t: "Looking at the current shortlist, Rosebank Link and Morningside should be the priority opens this quarter. Want me to draft a recommendation memo?",
    refs: ["S-121", "S-114"],
    chips: ["Draft memo", "Export to deck"],
  };
}

window.Assistant = Assistant;
