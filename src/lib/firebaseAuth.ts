/**
 * Firebase web auth - Sign in with Google via the Firebase client SDK.
 * The web apiKey is public by design; the server verifies the returned
 * idToken with the Identity Toolkit before issuing its own session cookie.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';
import { api } from '../api/client';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

const ensure = async (): Promise<Auth> => {
  if (auth) return auth;
  if (getApps().length) {
    app = getApp();
  } else {
    const { config } = await api.firebaseWebConfig();
    app = initializeApp(config);
  }
  auth = getAuth(app);
  return auth;
};

export const googleSignIn = async () => {
  const instance = await ensure();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(instance, provider);
  const idToken = await result.user.getIdToken();
  return api.loginWithGoogle(idToken);
};

export const describeGoogleError = (error: unknown): string => {
  const code = (error as { code?: string })?.code ?? '';
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is not enabled for this Firebase project yet. Enable Google → Firebase console → Authentication → Sign-in method.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in was cancelled.';
  }
  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the Google sign-in popup - allow popups for this site.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not in the Firebase authorized domains list (Authentication → Settings → Authorized domains). localhost is allowed by default.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error reaching Google - check the connection and try again.';
  }
  return message || 'Google sign-in failed';
};
