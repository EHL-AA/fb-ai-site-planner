import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { usePlanner } from '@/contexts/PlannerContext';
import { fetchSuburbSuggestions, newSessionToken, resolveSuburb, SuburbSuggestion } from '@/lib/site-planner/suburb-autocomplete';
import { SuburbSelection } from '@/lib/site-planner/types';

interface Props {
  disabled?: boolean;
  value: SuburbSelection | null;
  onSelect: (s: SuburbSelection | null) => void;
}

export default function SuburbSearch({ disabled, value, onSelect }: Props) {
  const { placesLib } = usePlanner();
  const [text, setText] = useState(value ? `${value.suburb}, ${value.city}` : '');
  const [items, setItems] = useState<SuburbSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<unknown>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const blurTimer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  const lib = placesLib as any;

  useEffect(() => { if (value) setText(`${value.suburb}, ${value.city}`); }, [value]);

  // Clear any pending debounce/blur timers on unmount so a late timeout can't
  // call setState (or kick off a network request) after the component is gone.
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    window.clearTimeout(blurTimer.current);
  }, []);

  const search = (q: string) => {
    window.clearTimeout(timer.current);
    if (!lib) return;
    timer.current = window.setTimeout(async () => {
      const mySeq = ++seq.current;
      try {
        if (!token.current) token.current = newSessionToken(lib);
        const out = await fetchSuburbSuggestions(lib, q, token.current);
        if (mySeq !== seq.current) return; // a newer request (or a pick) superseded this one
        setItems(out); setOpen(out.length > 0); setActive(0); setError(null);
      } catch (e) {
        if (mySeq !== seq.current) return;
        console.warn('autocomplete failed', e);
        setItems([]); setOpen(true); setError('Search unavailable');
      }
    }, 200);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    onSelect(null);
    search(e.target.value);
  };

  const pick = async (s: SuburbSuggestion) => {
    seq.current++; // invalidate any in-flight suggestion fetch so it can't reopen the list
    setOpen(false);
    try {
      const sel = await resolveSuburb(s);
      token.current = undefined; // fetchFields ends the billing session
      onSelect(sel);
    } catch (e: any) {
      setError(e?.message ?? 'Could not resolve suburb');
      setOpen(true);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const listId = useMemo(() => `suburb-list-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: `1px solid ${value ? 'var(--accent)' : 'var(--line-2)'}`, borderRadius: 10, padding: '8px 10px' }}>
        <Icon name="search" size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
        <input
          value={text} onChange={onChange} onKeyDown={onKey} onFocus={() => items.length && setOpen(true)}
          onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120); }}
          placeholder="Search a suburb…" disabled={disabled || !lib}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: 13, flex: 1, padding: 0, minWidth: 0 }} />
        {value && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
      </div>
      {open && (
        <ul id={listId} role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 50, margin: 0, padding: 4, listStyle: 'none', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', maxHeight: 260, overflowY: 'auto' }}>
          {error && <li style={{ padding: '8px 10px', fontSize: 12, color: 'var(--bad)' }}>{error}</li>}
          {items.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(s); }} onMouseEnter={() => setActive(i)}
              style={{ padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: i === active ? 'var(--bg-3)' : 'transparent' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{s.mainText}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{s.secondaryText}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
