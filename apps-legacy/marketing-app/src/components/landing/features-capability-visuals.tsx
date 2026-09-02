import Image from "next/image";

const DATA_LAYER_IMAGE =
  "https://framerusercontent.com/images/hEq2lGnA6G6ziYMb2M9sqX6hSdU.png";
const DATA_NODE_IMAGES = [
  "https://framerusercontent.com/images/boS3ut5EmUJTOMFw62VlJ0INwbA.svg",
  "https://framerusercontent.com/images/hhxDVYJfK141oFZTvQebHKmuBY8.svg",
  "https://framerusercontent.com/images/D5bKJwYni03bA1M7OPbvPvENbI.svg",
  "https://framerusercontent.com/images/ZkijOVhX07s9T5PnB7KP0QLAebc.svg",
];
const INTEGRATION_LOGOS = [
  "https://framerusercontent.com/images/wTcCUxnqAG0EAJA9nDolaMOGkUg.svg",
  "https://framerusercontent.com/images/xuxlCXQ0OVrRtNiFUK16nQc.svg",
  "https://framerusercontent.com/images/gW3r5ebQuwWxRf2escaqCWCVbI.svg",
  "https://framerusercontent.com/images/XOU3bUifiyOWTEVLPqJ8ovsYoU.svg",
  "https://framerusercontent.com/images/fdTeoN8pCamQcPJAn1hyJQFhE.svg",
  "https://framerusercontent.com/images/iQtqTITKY7zUT947iMba3jsyE.svg",
];

function CardGlow({ className }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute rounded-full bg-[#558BFB]/20 blur-3xl ${className ?? ""}`}
      aria-hidden
    />
  );
}

function WorkflowStep({
  label,
  title,
}: {
  label: string;
  title: string;
}) {
  return (
    <div className="relative flex w-full max-w-[220px] flex-col items-center">
      <div className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
        <CardGlow className="absolute -inset-6 opacity-60" />
        <p className="relative text-[10px] uppercase tracking-[0.14em] text-white/45">
          {label}
        </p>
        <p className="relative mt-1 text-sm text-white">{title}</p>
      </div>
    </div>
  );
}

function ActionRow({ label }: { label: string }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-[#558BFB]/15 text-[10px] text-[#558BFB]">
        ✓
      </span>
      <span className="text-[11px] text-white">{label}</span>
    </div>
  );
}

function ModelPill({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white">
      {label}
    </span>
  );
}

function IntegrationLogoRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      className="flex shrink-0 items-center gap-5 pr-5"
      aria-hidden={ariaHidden || undefined}
    >
      {INTEGRATION_LOGOS.map((src) => (
        <li key={`${ariaHidden ? "clone-" : ""}${src}`} className="shrink-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-2">
            <Image src={src} alt="" width={31} height={31} className="h-6 w-6 object-contain" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function VoiceOrderingVisual() {
  return (
    <div className="relative h-full overflow-hidden bg-black">
      <CardGlow className="left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute inset-x-8 top-1/2 h-px -translate-y-1/2 bg-[#558BFB]/10">
        <span className="features-data-path-dot absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#558BFB]" />
      </div>
      {DATA_NODE_IMAGES.map((src, index) => {
        const positions = [
          "left-[8%] top-[18%]",
          "right-[8%] top-[22%]",
          "left-[12%] bottom-[22%]",
          "right-[10%] bottom-[18%]",
        ];
        return (
          <div
            key={src}
            className={`absolute ${positions[index]} relative h-10 w-[68px]`}
          >
            <Image src={src} alt="" fill className="object-contain" />
          </div>
        );
      })}
      <div className="absolute inset-x-0 bottom-0 top-8 flex items-center justify-center">
        <Image
          src={DATA_LAYER_IMAGE}
          alt=""
          width={546}
          height={316}
          className="max-h-[58%] w-auto object-contain opacity-95"
        />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[11px] text-white backdrop-blur-sm">
        Voice Layer
      </div>
    </div>
  );
}

export function AvatarVisual() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden bg-black px-6 py-8">
      <WorkflowStep label="Trigger" title="Customer speaks" />
      <div className="h-6 w-px bg-white/15" aria-hidden />
      <WorkflowStep label="Process" title="Understand intent" />
      <div className="h-6 w-px bg-white/15" aria-hidden />
      <WorkflowStep label="Action" title="Update basket" />
    </div>
  );
}

export function MenuVisual() {
  const actions = [
    "Order received",
    "Item added to basket",
    "Payment QR shown",
    "Order confirmed",
    "Create customer profile",
  ];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-black px-5 py-6">
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
        <CardGlow className="absolute -inset-8 opacity-50" />
        <p className="relative text-[10px] leading-relaxed text-white">
          Add a latte and croissant
          <span className="features-cursor-blink ml-0.5 inline-block h-3 w-[2px] bg-white align-middle" />
        </p>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 p-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="features-vertical-marquee-track flex flex-col gap-2.5">
            {[...actions, ...actions].map((action, index) => (
              <ActionRow key={`${action}-${index}`} label={action} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardVisual() {
  const models = ["Gemini Live", "Speech", "Vision", "Menu AI"];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-black px-5 py-6">
      <div className="mx-auto w-full max-w-[220px] rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[11px] text-white">
        Task Input
      </div>
      <div className="mx-auto my-3 h-8 w-px bg-white/15" aria-hidden />
      <div className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
        <CardGlow className="absolute inset-0 opacity-70" />
        <p className="relative text-sm text-white">AI Router</p>
      </div>
      <div className="mx-auto my-3 h-8 w-px bg-white/15" aria-hidden />
      <div className="overflow-hidden">
        <div className="features-model-marquee-track flex w-max gap-2">
          {[...models, ...models].map((model, index) => (
            <ModelPill key={`${model}-${index}`} label={model} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppearanceVisual() {
  return (
    <div className="relative h-full overflow-hidden bg-black">
      <div className="absolute inset-0 flex items-center">
        <div className="features-integration-marquee-track flex w-max">
          <IntegrationLogoRow />
          <IntegrationLogoRow ariaHidden />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-black to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black to-transparent" />
    </div>
  );
}

export function BilingualVisual() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden bg-black px-6">
      <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
        <span className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black">
          EN
        </span>
        <span className="px-4 py-1.5 text-xs text-white/50">ID</span>
      </div>
      <div className="w-full max-w-[240px] space-y-2">
        <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/75">
          &ldquo;I&apos;d like a latte and a croissant.&rdquo;
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/75">
          &ldquo;Saya mau kopi susu dan roti.&rdquo;
        </div>
      </div>
    </div>
  );
}
