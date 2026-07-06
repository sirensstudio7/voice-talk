const STEPS = [
  {
    step: "01",
    title: "Set up your store",
    description:
      "Add your menu, train AI rules, upload your payment QR, and customize appearance in the Lore admin dashboard.",
  },
  {
    step: "02",
    title: "Share your link",
    description:
      "Give customers a simple URL like lore.app/b/your-store. No app download — works on any modern phone or desktop.",
  },
  {
    step: "03",
    title: "Customers order by voice",
    description:
      "They talk to your AI cashier, review the basket, confirm the order, and pay by scanning your QR code.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-500">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Live in three steps
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Go from sign-up to your first voice order in an afternoon.
          </p>
        </div>

        <ol className="mt-14 grid gap-8 lg:grid-cols-3">
          {STEPS.map(({ step, title, description }) => (
            <li key={step} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-8">
              <span className="text-sm font-semibold text-orange-500">{step}</span>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
