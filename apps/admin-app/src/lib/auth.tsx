"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  api,
  ApiRequestError,
  login as apiLogin,
  signup as apiSignup,
  type Business,
} from "@/lib/api";
import { detectCountryCode } from "@/lib/country";
import { deferEffectRun } from "@/lib/defer-effect-run";

type AuthUser = { id: string; email: string; name: string; country?: string };

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  businesses: Business[];
  business: Business | null;
  businessesLoading: boolean;
  businessesError: string | null;
  authReady: boolean;
  setBusinessId: (id: string) => void;
  login: (email: string, password: string) => Promise<Business[]>;
  signup: (email: string, password: string, name?: string) => Promise<"pending" | "active">;
  logout: () => void;
  refreshBusinesses: (opts?: { silent?: boolean }) => Promise<Business[]>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "lorescale_admin_token";
const USER_KEY = "lorescale_admin_user";
const BUSINESS_KEY = "lorescale_admin_business";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessIdState] = useState<string | null>(null);
  const [businessesLoading, setBusinessesLoading] = useState(true);
  const [businessesError, setBusinessesError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const businessesRequestRef = useRef<Promise<Business[]> | null>(null);

  useEffect(() => {
    // Platform super-admin impersonation handoff via URL hash
    deferEffectRun(() => {
      if (typeof window !== "undefined" && window.location.hash.includes("platform_impersonate=")) {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const impersonateToken = hash.get("platform_impersonate");
        const businessId = hash.get("business");
        if (impersonateToken) {
          localStorage.setItem(TOKEN_KEY, impersonateToken);
          if (businessId) localStorage.setItem(BUSINESS_KEY, businessId);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          setToken(impersonateToken);
          setBusinessIdState(businessId);
          setUser({ id: "impersonated", email: "", name: "Impersonating…" });
          localStorage.setItem(
            USER_KEY,
            JSON.stringify({ id: "impersonated", email: "", name: "Impersonating…" }),
          );
          const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
          void fetch(`${apiUrl}/admin/auth/me`, {
            headers: { Authorization: `Bearer ${impersonateToken}` },
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((me) => {
              if (!me) return;
              const nextUser = { id: me.id as string, email: me.email as string, name: `[Impersonating] ${me.name}` };
              localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
              setUser(nextUser);
            })
            .catch(() => undefined);
          setHydrated(true);
          return;
        }
      }

      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);
      const savedBusiness = localStorage.getItem(BUSINESS_KEY);
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser) as AuthUser);
        setBusinessIdState(savedBusiness);
      } else {
        setBusinessesLoading(false);
      }
      setHydrated(true);
    });
  }, []);

  const logout = () => {
    setToken(null);
    setUser(null);
    setBusinesses([]);
    setBusinessIdState(null);
    setBusinessesError(null);
    setBusinessesLoading(false);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(BUSINESS_KEY);
  };

  const refreshBusinesses = async (opts?: { silent?: boolean }) => {
    if (!token) {
      setBusinesses([]);
      setBusinessIdState(null);
      setBusinessesError(null);
      setBusinessesLoading(false);
      return [];
    }

    if (businessesRequestRef.current) {
      return businessesRequestRef.current;
    }

    if (!opts?.silent) {
      setBusinessesLoading(true);
    }
    setBusinessesError(null);

    const request = (async () => {
      try {
        const list = await api.listBusinesses(token);
        setBusinesses(list);

        const savedId = businessId ?? localStorage.getItem(BUSINESS_KEY);
        const matched = list.find((item) => item.id === savedId);
        const nextId = matched?.id ?? list[0]?.id ?? null;

        setBusinessIdState(nextId);
        if (nextId) {
          localStorage.setItem(BUSINESS_KEY, nextId);
        } else {
          localStorage.removeItem(BUSINESS_KEY);
        }

        return list;
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          logout();
          return [];
        }

        const message =
          error instanceof ApiRequestError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not load your workspaces.";
        setBusinessesError(message);
        return [];
      } finally {
        if (!opts?.silent) {
          setBusinessesLoading(false);
        }
        businessesRequestRef.current = null;
      }
    })();

    businessesRequestRef.current = request;
    return request;
  };

  useEffect(() => {
    if (!hydrated) return;
    if (token) {
      deferEffectRun(refreshBusinesses);
    }
    // refreshBusinesses is recreated every render and reads the latest token;
    // this effect intentionally runs only when the session hydrates or the token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hydrated]);

  const persistSession = (accessToken: string, nextUser: AuthUser) => {
    setToken(accessToken);
    setUser(nextUser);
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  };

  const login = async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    persistSession(result.access_token, result.user);
    const list = result.businesses ?? [];
    setBusinesses(list);
    setBusinessesError(null);
    setBusinessesLoading(false);

    const nextId = list[0]?.id ?? null;
    setBusinessIdState(nextId);
    if (nextId) {
      localStorage.setItem(BUSINESS_KEY, nextId);
    } else {
      localStorage.removeItem(BUSINESS_KEY);
    }

    return list;
  };

  const signup = async (email: string, password: string, name?: string) => {
    const result = await apiSignup(email, password, name, detectCountryCode());
    if (!("access_token" in result)) {
      return "pending";
    }
    persistSession(result.access_token, {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      country: result.user.country,
    });
    setBusinesses([]);
    setBusinessIdState(null);
    localStorage.removeItem(BUSINESS_KEY);
    setBusinessesError(null);
    setBusinessesLoading(false);
    return "active";
  };

  const setBusinessId = (id: string) => {
    setBusinessIdState(id);
    localStorage.setItem(BUSINESS_KEY, id);
  };

  const business = useMemo(
    () => businesses.find((item) => item.id === businessId) ?? null,
    [businesses, businessId],
  );

  const authReady = hydrated && (!token || !businessesLoading);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        businesses,
        business,
        businessesLoading,
        businessesError,
        authReady,
        setBusinessId,
        login,
        signup,
        logout,
        refreshBusinesses,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
