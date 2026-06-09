/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

// Firebase web config, injected at build time from FIREBASE_* env vars
// (see vite.config.ts + .env.example).
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

/**
 * True when the Firebase config has been populated. When false the app should
 * surface a clear "configure Firebase" message rather than crash on init.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
}

/** Initialised Firebase Auth instance, or null if Firebase isn't configured. */
export const auth = authInstance;

/** Shared Google provider for popup sign-in. */
export const googleProvider = new GoogleAuthProvider();
