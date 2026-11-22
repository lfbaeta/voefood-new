import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import {
  auth,
  googleAuthProvider,
  getFirebaseIdToken,
  clearFirebaseTokenCache,
} from '@/lib/firebase';
import type { CompatSession, CompatUser } from '@/integrations/supabase/client';

interface AuthContextType {
  user: CompatUser | null;
  session: CompatSession | null;
  isLoading: boolean;
  isAdmin: boolean;
  isReseller: boolean;
  refreshRole: () => Promise<void>;
  signInWithGoogle: () => Promise<CompatUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CompatUser | null>(null);
  const [session, setSession] = useState<CompatSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isReseller, setIsReseller] = useState(false);

  const syncUserAndRoles = async (forceRefresh = false) => {
    try {
      const token = await getFirebaseIdToken(forceRefresh);
      if (!token) {
        setIsAdmin(false);
        setIsReseller(false);
        return;
      }

      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        setIsAdmin(false);
        setIsReseller(false);
        return;
      }

      const data = await res.json();
      setIsAdmin(Boolean(data?.permissions?.isAdmin));
      setIsReseller(Boolean(data?.permissions?.isReseller));
    } catch (error) {
      console.error('Error syncing roles from Cloud SQL:', error);
      setIsAdmin(false);
      setIsReseller(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        clearFirebaseTokenCache();
        setUser(null);
        setSession(null);
        setIsAdmin(false);
        setIsReseller(false);
        setIsLoading(false);
        return;
      }

      const token = (await getFirebaseIdToken()) || '';
      const compatUser: CompatUser = {
        id: fbUser.uid,
        email: fbUser.email ?? undefined,
        user_metadata: {
          full_name: fbUser.displayName ?? undefined,
          name: fbUser.displayName ?? undefined,
          avatar_url: fbUser.photoURL ?? undefined,
        },
        app_metadata: { provider: 'google' },
        aud: 'authenticated',
        created_at: fbUser.metadata.creationTime ?? new Date().toISOString(),
      };

      setUser(compatUser);
      setSession({
        access_token: token,
        token_type: 'bearer',
        user: compatUser,
      });

      await syncUserAndRoles();
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const token = (await getFirebaseIdToken(true)) || '';
    const compatUser: CompatUser = {
      id: cred.user.uid,
      email: cred.user.email ?? undefined,
      user_metadata: {
        full_name: cred.user.displayName ?? undefined,
        name: cred.user.displayName ?? undefined,
        avatar_url: cred.user.photoURL ?? undefined,
      },
      app_metadata: { provider: 'google' },
      aud: 'authenticated',
      created_at: cred.user.metadata.creationTime ?? new Date().toISOString(),
    };
    setUser(compatUser);
    setSession({
      access_token: token,
      token_type: 'bearer',
      user: compatUser,
    });
    await syncUserAndRoles(true);
    return compatUser;
  };

  const refreshRole = async () => {
    await syncUserAndRoles(false);
  };

  const signOut = async () => {
    clearFirebaseTokenCache();
    await firebaseSignOut(auth);
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setIsReseller(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAdmin,
        isReseller,
        refreshRole,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}