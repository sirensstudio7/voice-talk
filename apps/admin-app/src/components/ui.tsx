import type { ReactNode } from "react";

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-h-[7.875rem] flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-auto pt-3">
        <p className="text-3xl font-bold tracking-tight tabular-nums text-slate-900">{value}</p>
        {hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
