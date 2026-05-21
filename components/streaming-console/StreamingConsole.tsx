/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePlannerStore } from '@/lib/site-planner/data-store';

/** The assistant conversation: the user's refinement requests and the
 *  model's narrative replies. Re-ranking also updates the Ranked sites tab. */
export default function AssistantChat() {
  const chat = usePlannerStore(s => s.chat);
  const features = usePlannerStore(s => s.features);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat]);

  if (!chat.length) {
    return (
      <div className="chat-empty">
        <span className="icon">forum</span>
        <p className="chat-empty-title">Refine the ranking in plain language</p>
        <p className="chat-empty-hint">
          {features.length
            ? 'Try: “prioritise high-LSM areas” · “avoid anything within 2 km of an existing Steers” · “weight foot traffic higher”.'
            : 'Find sites for a suburb first, then ask me to re-rank them however you like.'}
        </p>
      </div>
    );
  }

  return (
    <div className="assistant-chat" ref={scrollRef}>
      {chat.map((t, i) => (
        <div key={i} className={`chat-row ${t.role}`}>
          <div className="chat-bubble">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}
