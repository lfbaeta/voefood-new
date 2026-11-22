import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

// Keep ID token in memory only (never in localStorage)
let cachedToken: string | null = null;
let cachedTokenExpiry = 0;

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    cachedToken = null;
    cachedTokenExpiry = 0;
    return null;
  }

  const now = Date.now();
  if (!forceRefresh && cachedToken && now < cachedTokenExpiry) {
    return cachedToken;
  }

  try {
    const tokenResult = await user.getIdTokenResult(forceRefresh);
    cachedToken = tokenResult.token;
    const expMs = new Date(tokenResult.expirationTime).getTime();
    cachedTokenExpiry = Math.max(now + 60_000, expMs - 120_000);
    return cachedToken;
  } catch (error) {
    console.error('Failed to retrieve Firebase ID token:', error);
    cachedToken = null;
    cachedTokenExpiry = 0;
    return null;
  }
}

export function clearFirebaseTokenCache(): void {
  cachedToken = null;
  cachedTokenExpiry = 0;
}
