"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHttpClient, type HttpClient, type HttpClientConfig } from "./http";

const HttpClientContext = createContext<HttpClient | null>(null);

export function useHttpClient(): HttpClient {
  const client = useContext(HttpClientContext);
  if (!client) throw new Error("useHttpClient must be used within an ApiClientProvider");
  return client;
}

export function ApiClientProvider({ config, children }: { config: HttpClientConfig; children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
    },
  }), []);
  const httpClient = useMemo(() => createHttpClient(config), [config]);

  return (
    <HttpClientContext.Provider value={httpClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </HttpClientContext.Provider>
  );
}
