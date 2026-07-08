const USE_CASES_ROW_1 = [
  "Take voice orders",
  "Browse the menu",
  "Add to basket",
  "Confirm order",
  "Scan payment QR",
  "Switch language",
  "Track conversations",
  "Manage menu items",
];

const USE_CASES_ROW_2 = [
  "Customize appearance",
  "Set AI rules",
  "View analytics",
  "Handle rush hour",
  "Upsell add-ons",
  "Train knowledge base",
  "Review orders",
  "Launch new locations",
];

function UseCasePill({ label }: { label: string }) {
  return (
    <li className="shrink-0">
      <span className="inline-flex rounded-md border border-white/10 bg-black px-4 py-2 text-sm text-white">
        {label}
      </span>
    </li>
  );
}

function UseCaseRow({
  items,
  ariaHidden = false,
}: {
  items: readonly string[];
  ariaHidden?: boolean;
}) {
  return (
    <ul
      className="flex shrink-0 items-center gap-4 pr-4"
      aria-hidden={ariaHidden || undefined}
    >
      {items.map((label) => (
        <UseCasePill key={`${ariaHidden ? "clone-" : ""}${label}`} label={label} />
      ))}
    </ul>
  );
}

function UseCaseMarquee({ items, reverse = false }: { items: readonly string[]; reverse?: boolean }) {
  const trackClass = reverse
    ? "features-use-case-marquee-track-reverse"
    : "features-use-case-marquee-track";

  return (
    <div className="overflow-hidden py-3">
      <div className={`${trackClass} flex w-max`}>
        <UseCaseRow items={items} />
        <UseCaseRow items={items} ariaHidden />
      </div>
    </div>
  );
}

export function FeaturesUseCaseTicker() {
  return (
    <div className="relative border-t border-dashed border-white/10">
      <div
        className="relative py-6"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      >
        <UseCaseMarquee items={USE_CASES_ROW_1} />
        <UseCaseMarquee items={USE_CASES_ROW_2} reverse />
      </div>
    </div>
  );
}
