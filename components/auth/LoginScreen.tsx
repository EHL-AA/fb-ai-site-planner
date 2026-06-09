/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useCallback, FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '@/contexts/AuthContext';

/** Maps the noisy Firebase auth error codes to user-friendly copy. */
function friendlyError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-email':
        return 'That email address looks invalid.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Incorrect email or password.';
      case 'auth/email-already-in-use':
        return 'An account already exists for that email.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Popup blocked — allow popups and try again.';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export default function LoginScreen() {
  const { configured, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleEmailSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        if (mode === 'signin') {
          await signInWithEmail(email, password);
        } else {
          await signUpWithEmail(email, password);
        }
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setBusy(false);
      }
    },
    [mode, email, password, signInWithEmail, signUpWithEmail],
  );

  const handleGoogle = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, [signInWithGoogle]);

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>Site Planner</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        {!configured && (
          <div style={styles.configWarning}>
            Firebase isn’t configured. Add your <code>FIREBASE_*</code> values to{' '}
            <code>.env</code> and restart the dev server.
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy || !configured}
          style={{ ...styles.googleBtn, ...(busy || !configured ? styles.disabled : {}) }}>
          <GoogleIcon />
          Continue with Google
        </button>

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        <form onSubmit={handleEmailSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              className="sp-auth-input"
              disabled={busy || !configured}
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
              className="sp-auth-input"
              disabled={busy || !configured}
            />
          </label>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={busy || !configured}
            style={{ ...styles.primaryBtn, ...(busy || !configured ? styles.disabled : {}) }}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode(m => (m === 'signin' ? 'signup' : 'signin'));
          }}
          style={styles.toggle}>
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

const FONT = "'Geist', -apple-system, BlinkMacSystemFont, sans-serif";

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg, #0c0a08)',
    padding: 24,
    zIndex: 1000,
    fontFamily: FONT,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    background: 'var(--bg-1, #131210)',
    border: '1px solid var(--line, #2a2622)',
    borderRadius: 16,
    padding: '32px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 600,
    color: 'var(--ink, #f5f0e8)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: 'var(--ink-3, #8a8278)',
    textAlign: 'center',
  },
  configWarning: {
    background: 'rgba(239,106,94,0.10)',
    color: 'var(--bad, #ef6a5e)',
    border: '1px solid rgba(239,106,94,0.35)',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: 1.4,
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    padding: '11px 16px',
    borderRadius: 10,
    border: '1px solid var(--line-2, #3a3530)',
    background: 'var(--bg-2, #1a1815)',
    color: 'var(--ink, #f5f0e8)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--line, #2a2622)',
  },
  dividerText: {
    fontSize: 12,
    color: 'var(--ink-3, #8a8278)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    color: 'var(--ink-2, #c9c0b4)',
  },
  input: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--line, #2a2622)',
    background: 'var(--bg-2, #1a1815)',
    color: 'var(--ink, #f5f0e8)',
    fontSize: 14,
    outline: 'none',
    fontFamily: FONT,
  },
  error: {
    color: 'var(--bad, #ef6a5e)',
    fontSize: 13,
  },
  primaryBtn: {
    width: '100%',
    padding: '11px 16px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--accent, #f5a524)',
    color: 'var(--accent-ink, #1a1208)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT,
  },
  disabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
  toggle: {
    background: 'none',
    border: 'none',
    color: 'var(--accent, #f5a524)',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    fontFamily: FONT,
  },
};
