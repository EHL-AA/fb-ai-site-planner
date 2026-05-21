import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from './Icon';
import { usePlanner } from '@/contexts/PlannerContext';
import { usePlannerStore } from '@/lib/site-planner/data-store';
import { toDisplaySites } from '@/lib/site-planner/display';

const sparkBadge = (size: number): React.CSSProperties => ({
  width: size, height: size, borderRadius: size, flexShrink: 0,
  background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
  display: 'grid', placeItems: 'center', color: 'var(--accent-ink)',
});

export default function AssistantPanel() {
  const { ask } = usePlanner();
  const { chat, status, features, result, suburb, brand, selectedSiteId, competitorsData } = usePlannerStore();
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = status === 'reasoning';
  const ready = features.length > 0;
  const dataLoaded = competitorsData.length > 0;
  // Chat is usable immediately (query your data) — not gated on running an analysis.
  const suggestions = ready
    ? ['Weight foot traffic higher', 'Avoid cannibalisation', 'Show all burger places']
    : ['Show all burger places', 'Show all pizza places', 'Where are the KFCs'];

  const selected = useMemo(
    () => toDisplaySites(features, result, suburb).find(s => s.id === selectedSiteId) ?? null,
    [features, result, suburb, selectedSiteId],
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat, busy]);

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    ask(q);
    setInput('');
  };

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} style={{
        position: 'absolute', right: 16, top: 16, zIndex: 60, background: 'var(--bg-1)', border: '1px solid var(--line)',
        color: 'var(--ink)', borderRadius: 12, padding: '10px 14px 10px 12px', display: 'flex', alignItems: 'center', gap: 8,
        cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}>
        <span style={sparkBadge(22)}><Icon name="sparkle" size={12} stroke={2.2} /></span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Ask the planner</span>
      </button>
    );
  }

  return (
    <aside className="sp-right-rail" style={{ width: 384, height: '100%', background: 'var(--bg-1)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={sparkBadge(28)}><Icon name="sparkle" size={14} stroke={2.2} /></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              Planner AI
              <span style={{ fontSize: 10, color: 'var(--good)', background: 'rgba(109,213,140,0.10)', border: '1px solid rgba(109,213,140,0.3)', borderRadius: 999, padding: '1px 6px' }}>● Gemini 2.5 Pro</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: -1 }}>
              {brand}{suburb ? ` · ${suburb}` : ''}{ready ? ` · ${features.length} sites` : ''}
            </div>
          </div>
        </div>
        <button onClick={() => setCollapsed(true)} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 6, color: 'var(--ink-2)', cursor: 'pointer', height: 28, display: 'grid', placeItems: 'center' }} aria-label="Collapse"><Icon name="close" size={14} /></button>
      </div>

      {/* Context bar */}
      {selected && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="target" size={14} style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Discussing</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</div>
          </div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{selected.code}</span>
        </div>
      )}

      {/* Thread */}
      <div ref={scrollRef} className="sp-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {chat.length === 0 && !busy && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <span style={{ ...sparkBadge(30) }}><Icon name="sparkle" size={15} stroke={2.2} /></span>
            <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, fontWeight: 600 }}>Ask me anything about your map.</p>
            <p style={{ margin: 0 }}>{dataLoaded ? 'Try “show all burger places” or “pizza places” to map your competitor data — no need to run an analysis first. Or pick a suburb and hit Find sites, then ask me to re-rank.' : 'Loading your Famous Brands data…'}</p>
          </div>
        )}
        {chat.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '90%', background: 'var(--bg-3)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 13, lineHeight: 1.5, padding: '10px 12px', borderRadius: '14px 14px 4px 14px' }}>{m.text}</div>
          ) : (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '100%', display: 'flex', gap: 10 }}>
              <span style={sparkBadge(24)}><Icon name="sparkle" size={13} stroke={2.2} /></span>
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55, color: 'var(--ink)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
              </div>
            </div>
          )
        ))}
        {busy && (
          <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', alignItems: 'center' }}>
            <span style={sparkBadge(24)}><Icon name="sparkle" size={13} stroke={2.2} /></span>
            <div style={{ display: 'inline-flex', gap: 4, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 12 }}>
              <span className="bounce-dot" style={{ animationDelay: '0s' }} />
              <span className="bounce-dot" style={{ animationDelay: '.15s' }} />
              <span className="bounce-dot" style={{ animationDelay: '.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Suggested prompts */}
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {suggestions.map(p => (
          <button key={p} onClick={() => send(p)} disabled={busy} style={{
            background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 11px',
            color: 'var(--ink-2)', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 11,
          }}>{p}</button>
        ))}
      </div>

      {/* Composer */}
      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 12, padding: '6px 6px 6px 12px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={'Show places, re-rank, ask…'}
            disabled={busy}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: 13, padding: '6px 0', minWidth: 0 }}
          />
          <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send" style={{
            background: input.trim() && !busy ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'var(--bg-3)',
            border: 'none', borderRadius: 8, padding: '7px 10px',
            color: input.trim() && !busy ? 'var(--accent-ink)' : 'var(--ink-3)',
            cursor: input.trim() && !busy ? 'pointer' : 'not-allowed', display: 'inline-grid', placeItems: 'center',
          }}><Icon name="send" size={13} stroke={2.2} /></button>
        </div>
      </div>
    </aside>
  );
}
