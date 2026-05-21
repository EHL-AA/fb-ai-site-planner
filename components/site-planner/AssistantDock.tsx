import React from 'react';
import AssistantChat from '../streaming-console/StreamingConsole';
import ChatComposer from './ChatComposer';
import { usePlannerStore } from '@/lib/site-planner/data-store';

export default function AssistantDock() {
  const chatCount = usePlannerStore(s => s.chat.length);

  return (
    <aside className="assistant-dock">
      <header className="dock-head">
        <div className="dock-title">
          <span className="icon">forum</span>
          Assistant
        </div>
        {chatCount > 0 && <span className="dock-count">{chatCount}</span>}
      </header>

      <div className="dock-body">
        <AssistantChat />
      </div>

      <ChatComposer />
    </aside>
  );
}
