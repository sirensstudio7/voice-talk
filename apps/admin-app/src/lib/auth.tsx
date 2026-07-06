"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, ApiRequestError, login as apiLogin, type Business } from "@/lib/api";

type AuthUser = { id: string; email: string; name: string };

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  businesses: Business[];
  business: Business | null;
  setBusinessId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshBusinesses: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "eva_admin_token";
const USER_KEY = "eva_admin_user";
const BUSINESS_KEY = "eva_admin_business";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessIdState] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    const savedBusiness = localStorage.getItem(BUSINESS_KEY);
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser) as AuthUser);
      setBusinessIdState(savedBusiness);
    }
  }, []);

  const refreshBusinesses = async () => {
    if (!token) return;
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
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        logout();
      }
    }
  };

  useEffect(() => {
    if (token) {
      void refreshBusinesses();
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setToken(result.access_token);
    setUser(result.user);
    localStorage.setItem(TOKEN_KEY, result.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setBusinesses([]);
    setBusinessIdState(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(BUSINESS_KEY);
  };

  const setBusinessId = (id: string) => {
    setBusinessIdState(id);
    localStorage.setItem(BUSINESS_KEY, id);
  };

  const business = useMemo(
    () => businesses.find((item) => item.id === businessId) ?? null,
    [businesses, businessId],
  );

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        businesses,
        business,
        setBusinessId,
        login,
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
