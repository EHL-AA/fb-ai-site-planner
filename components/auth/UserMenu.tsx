/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Compact signed-in chip pinned to the top-right. Shows the current user's
 * email/name and a sign-out action. Self-contained so it can be dropped in
 * without touching the existing map chrome.
 */
export default function UserMenu() {
  const { user, logOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await logOut();
    } finally {
      setBusy(false);
    }
  }, [logOut]);

  if (!user) return null;

  const label = user.displayName || user.email || 'Signed in';

  return (
    <div style={styles.wrap}>
      {user.photoURL ? (
        <img src={user.photoURL} alt="" style={styles.avatar} referrerPolicy="no-referrer" />
      ) : (
        <span style={styles.avatarFallback}>{label.charAt(0).toUpperCase()}</span>
      )}
      <span style={styles.label} title={label}>{label}</span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        style={styles.btn}>
        {busy ? '…' : 'Sign out'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed',
    top: 12,
    right: 12,
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 8px 5px 5px',
    borderRadius: 999,
    background: 'var(--bg-1, #131210)',
    border: '1px solid var(--line, #2a2622)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    maxWidth: 260,
    fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 999,
    objectFit: 'cover',
  },
  avatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 999,
    display: 'grid',
    placeItems: 'center',
    background: 'var(--accent, #f5a524)',
    color: 'var(--accent-ink, #1a1208)',
    fontSize: 13,
    fontWeight: 700,
  },
  label: {
    fontSize: 12,
    color: 'var(--ink, #f5f0e8)',
    maxWidth: 130,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  btn: {
    background: 'var(--bg-2, #1a1815)',
    border: '1px solid var(--line, #2a2622)',
    borderRadius: 999,
    color: 'var(--accent, #f5a524)',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
  },
};
