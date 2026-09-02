"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, type PlatformAdmin } from "@/lib/api";

type AuthContextValue = {
  token: string | null;
  admin: PlatformAdmin | null;
  authReady: boolean;
  setSession: (token: string, admin: PlatformAdmin) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "lorescale_platform_token";
const ADMIN_KEY = "lorescale_platform_admin";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedAdmin = localStorage.getItem(ADMIN_KEY);
      if (!savedToken || !savedAdmin) {
        if (!cancelled) setAuthReady(true);
        return;
      }

      try {
        const admin = await api.me(savedToken);
        if (cancelled) return;
        localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
        setToken(savedToken);
        setAdmin(admin);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ADMIN_KEY);
        if (!cancelled) {
          setToken(null);
          setAdmin(null);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      admin,
      authReady,
      setSession: (nextToken, nextAdmin) => {
        localStorage.setItem(TOKEN_KEY, nextToken);
        localStorage.setItem(ADMIN_KEY, JSON.stringify(nextAdmin));
        setToken(nextToken);
        setAdmin(nextAdmin);
      },
      logout: () => {
        const current = localStorage.getItem(TOKEN_KEY);
        if (current) void api.logout(current).catch(() => undefined);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ADMIN_KEY);
        setToken(null);
        setAdmin(null);
      },
    }),
    [token, admin, authReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
