/**
 * Defers `run` by one microtask.
 *
 * Effect-driven loaders synchronously set loading/data state, which
 * `react-hooks/set-state-in-effect` flags as a cascading render. Starting the
 * work right after the effect commit keeps the behaviour while avoiding the
 * synchronous cascade. See TKT-039.
 */
export function deferEffectRun(run: () => void): void {
  queueMicrotask(run);
}
