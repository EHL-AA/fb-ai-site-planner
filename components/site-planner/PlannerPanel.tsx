import React, { useEffect, useRef, useState } from 'react';
import SuburbSearch from './SuburbSearch';
import RankedPanel from './RankedPanel';
import ChatComposer from './ChatComposer';
import AssistantChat from '../streaming-console/StreamingConsole';
import { usePlannerStore } from '@/lib/site-planner/data-store';

type Tab = 'ranked' | 'chat';

export default function PlannerPanel({ panelRef }: { panelRef?: React.Ref<HTMLDivElement> }) {
  const { status, result, chat } = usePlannerStore();
  const [tab, setTab] = useState<Tab>('ranked');
  const rankedCount = result?.ranked.length ?? 0;
  const chatCount = chat.length;

  // When a new assistant reply arrives, surface the Assistant tab so the
  // user always sees the response to their refinement.
  const prevChat = useRef(0);
  useEffect(() => {
    if (chat.length > prevChat.current) setTab('chat');
    prevChat.current = chat.length;
  }, [chat.length]);

  const statusLabel =
    status === 'detecting'
      ? 'Scanning Google Places for commercial nodes…'
      : status === 'reasoning'
        ? 'Gemini 2.5 Pro is scoring the candidates…'
        : null;

  const showTabs = rankedCount > 0 || chatCount > 0;

  return (
    <div className="rail" ref={panelRef}>
      <header className="rail-head">
        <div className="brand-mark">
          <span className="brand-kicker">Famous Brands</span>
          <span className="brand-title">Site Planner</span>
        </div>
      </header>

      <SuburbSearch />

      {statusLabel && (
        <div className="rail-status">
          <span className="pulse-dot" />
          <span>{statusLabel}</span>
        </div>
      )}

      {showTabs && (
        <nav className="rail-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ranked'}
            className={tab === 'ranked' ? 'active' : ''}
            onClick={() => setTab('ranked')}
          >
            Ranked sites{rankedCount > 0 && <span className="tab-count">{rankedCount}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            className={tab === 'chat' ? 'active' : ''}
            onClick={() => setTab('chat')}
          >
            Assistant{chatCount > 0 && <span className="tab-count">{chatCount}</span>}
          </button>
        </nav>
      )}

      <div className="rail-body">{tab === 'ranked' ? <RankedPanel /> : <AssistantChat />}</div>

      <ChatComposer />
    </div>
  );
}
