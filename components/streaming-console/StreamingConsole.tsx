/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePlannerStore } from '@/lib/site-planner/data-store';

export default function StreamingConsole() {
  const chat = usePlannerStore(s => s.chat);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat]);

  if (!chat.length) return <div className="transcription-container" />;

  return (
    <div className="transcription-container">
      <div className="transcription-view" ref={scrollRef}>
        {chat.map((t, i) => (
          <div key={i} className={`transcription-entry ${t.role}`}>
            <div className="avatar"><span className="icon">{t.role === 'user' ? 'person' : 'auto_awesome'}</span></div>
            <div className="message-bubble">
              <div className="transcription-text-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
