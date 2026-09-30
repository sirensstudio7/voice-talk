"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards.
 *
 * Server-safe replacement for the `useEffect(() => setMounted(true), [])`
 * pattern, which `react-hooks/set-state-in-effect` flags.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
