export function AddonConfigPending() {
  return (
    <section className="space-y-3" aria-busy="true" aria-label="Loading configuration">
      <div className="h-7 w-40 animate-pulse rounded bg-slate-100" />
      <div className="h-11 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-36 w-full animate-pulse rounded-2xl bg-slate-100" />
    </section>
  );
}
