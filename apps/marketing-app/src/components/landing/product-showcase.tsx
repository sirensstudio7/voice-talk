import { ProductShowcaseCarousel } from "@/components/landing/product-showcase-carousel";

export function ProductShowcase() {
  return (
    <section className="relative bg-white">
      <div className="landing-container border-x border-dashed border-black/[0.06]">
        <div className="py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto w-fit rounded-full bg-[#f1efec] px-4 py-1 text-xs font-medium uppercase tracking-wider text-black">
              Product preview
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Immersive voice up front
              <br />
              Dashboard You Control
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Lore pairs natural voice interactions with
              <br />
              a full business dashboard for AI rules, Knowledge, orders and analytics.
            </p>
          </div>

          <ProductShowcaseCarousel />
        </div>
      </div>
    </section>
  );
}
