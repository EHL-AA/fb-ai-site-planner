import React, { useState, FormEvent } from 'react';
import { usePlanner } from '@/contexts/PlannerContext';
import { usePlannerStore } from '@/lib/site-planner/data-store';

export default function ChatComposer() {
  const { sendChat } = usePlanner();
  const { status, features } = usePlannerStore();
  const [text, setText] = useState('');
  const disabled = !features.length || status === 'reasoning' || status === 'detecting';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    sendChat(text.trim());
    setText('');
  };

  return (
    <form className="chat-composer" onSubmit={onSubmit}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={features.length ? 'Refine: e.g. "weight foot traffic higher"' : 'Find sites first…'}
        disabled={disabled}
        aria-label="Refine ranking"
      />
      <button type="submit" disabled={disabled || !text.trim()}>Send</button>
    </form>
  );
}
