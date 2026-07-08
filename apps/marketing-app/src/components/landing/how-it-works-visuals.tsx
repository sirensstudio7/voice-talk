import Image from "next/image";

const BG_SETUP =
  "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&auto=format&fit=crop&q=80";
const BG_SHARE =
  "https://images.unsplash.com/photo-1556656793-08538906a9f8?w=1200&auto=format&fit=crop&q=80";
const BG_VOICE =
  "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=1200&auto=format&fit=crop&q=80";

function VisualFrame({
  bgSrc,
  children,
}: {
  bgSrc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative aspect-[1.13/1] w-full overflow-hidden rounded-lg">
      <Image
        src={bgSrc}
        alt=""
        fill
        className="object-cover"
        sizes="(min-width: 1024px) 50vw, 100vw"
      />
      <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-10">
        {children}
      </div>
    </div>
  );
}

function MockCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-[280px] overflow-hidden rounded-lg border border-[#f0f0f0] bg-white shadow-[0_7px_14px_rgba(0,0,0,0.07),0_26px_26px_rgba(0,0,0,0.06)]">
      <div className="border-b border-[#fafafa] px-4 py-3">
        <p className="text-sm font-medium text-[#181818]">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function SetupStoreVisual() {
  return (
    <VisualFrame bgSrc={BG_SETUP}>
      <MockCard title="Store Dashboard">
        <div className="space-y-2.5">
          {["Menu items", "AI rules", "Payment QR"].map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-md border border-[#f0f0f0] px-3 py-2"
            >
              <span className="text-xs text-[#181818]">{item}</span>
              <span className="h-2 w-2 rounded-full bg-[#558BFB]" aria-hidden />
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md bg-[#f0f0f0] px-3 py-2">
          <div className="h-1.5 w-3/5 rounded-full bg-[#181818]" />
        </div>
      </MockCard>
    </VisualFrame>
  );
}

export function ShareLinkVisual() {
  return (
    <VisualFrame bgSrc={BG_SHARE}>
      <MockCard title="Customer Link">
        <div className="rounded-md border border-[#f0f0f0] bg-[#fafafa] px-3 py-2 text-center text-xs text-[#181818]">
          lore.app/b/your-store
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[#f0f0f0] bg-white">
            <div className="grid grid-cols-3 gap-0.5">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="h-1.5 w-1.5 bg-[#181818]" aria-hidden />
              ))}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-[#46484d]">
            Scan or tap — no app download required.
          </p>
        </div>
      </MockCard>
    </VisualFrame>
  );
}

export function VoiceOrderVisual() {
  return (
    <VisualFrame bgSrc={BG_VOICE}>
      <MockCard title="Voice Order">
        <div className="space-y-2">
          <div className="rounded-md border border-[#f0f0f0] px-3 py-2 text-xs text-[#181818]">
            &ldquo;I&apos;ll take a latte and croissant&rdquo;
          </div>
          <div className="rounded-md bg-[#181818] px-3 py-2 text-xs text-white">
            Added to basket · $12.50
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#46484d]">
            <span>Payment QR ready</span>
            <span className="font-medium text-[#181818]">Confirmed</span>
          </div>
        </div>
      </MockCard>
    </VisualFrame>
  );
}
