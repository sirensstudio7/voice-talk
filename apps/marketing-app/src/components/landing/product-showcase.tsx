function BrowserChrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="mx-auto rounded-md bg-white px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

function CustomerMockup() {
  return (
    <div className="relative aspect-[16/10] bg-gradient-to-b from-slate-100 to-slate-200">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          Eva · Live
        </div>
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          Basket · 2
        </div>
      </div>

      <div className="absolute inset-x-0 top-1/4 flex justify-center">
        <div className="h-40 w-28 rounded-full bg-gradient-to-b from-orange-100 to-slate-200 shadow-inner ring-4 ring-white/60" />
      </div>

      <div className="absolute bottom-24 left-4 max-w-[11rem] rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur-sm">
        <p className="text-[10px] font-medium uppercase tracking-wide text-orange-500">Eva</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-700">
          Hi! What can I get started for you today?
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-100 via-slate-100/80 to-transparent px-4 pb-4 pt-16">
        <div className="mx-auto flex max-w-xs items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white shadow-sm ring-1 ring-slate-200" />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 shadow-lg shadow-orange-500/30">
            <div className="h-5 w-5 rounded-sm bg-white/90" />
          </div>
          <div className="h-10 w-10 rounded-full bg-white shadow-sm ring-1 ring-slate-200" />
        </div>
      </div>
    </div>
  );
}

function AdminMockup() {
  return (
    <div className="flex aspect-[16/10] bg-slate-50">
      <div className="hidden w-14 shrink-0 border-r border-slate-200 bg-white sm:block">
        <div className="space-y-3 p-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-6 w-32 rounded-md bg-slate-200" />
          <div className="h-8 w-24 rounded-lg bg-orange-500/90" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {["Sessions", "Orders", "Revenue", "AOV"].map((label) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">128</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 h-4 w-40 rounded bg-slate-200" />
          <div className="flex h-24 items-end gap-2">
            {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-orange-500 to-orange-400"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductShowcase() {
  return (
    <section className="relative bg-white">
      <div className="landing-container border-x border-dashed border-black/[0.06]">
        <div className="px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-500">
              Product preview
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Voice ordering customers love. Dashboard you control.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Lore pairs a immersive customer voice experience with a full merchant dashboard for
              menu, AI rules, orders, and analytics.
            </p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
            <BrowserChrome title="lore.app/b/your-store">
              <CustomerMockup />
            </BrowserChrome>

            <BrowserChrome title="admin.lore.app">
              <AdminMockup />
            </BrowserChrome>
          </div>
        </div>
      </div>
    </section>
  );
}
