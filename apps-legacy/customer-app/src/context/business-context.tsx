"use client";

import { createContext, useContext, type ReactNode } from "react";

const BusinessContext = createContext<string>("sunrise-coffee");

export function BusinessProvider({ slug, children }: { slug: string; children: ReactNode }) {
  return <BusinessContext.Provider value={slug}>{children}</BusinessContext.Provider>;
}

export function useBusinessSlug() {
  return useContext(BusinessContext);
}
