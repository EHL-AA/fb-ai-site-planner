/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';

interface AuthContextValue {
  /** Currently signed-in user, or null when signed out. */
  user: User | null;
  /** True until the initial auth state has been resolved. */
  initializing: boolean;
  /** Whether Firebase config was supplied (FIREBASE_* env vars). */
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (!auth) {
      // No Firebase config — nothing to subscribe to.
      setInitializing(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, nextUser => {
      setUser(nextUser);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) throw new Error('Firebase is not configured.');
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase is not configured.');
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase is not configured.');
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const logOut = useCallback(async () => {
    if (!auth) return;
    await signOut(auth);
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        initializing,
        configured: isFirebaseConfigured,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        logOut,
      }}>
      {children}
    </Ctx.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
