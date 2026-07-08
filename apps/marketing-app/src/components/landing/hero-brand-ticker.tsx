import Image from "next/image";

const BRAND_LOGOS = [
  {
    src: "https://framerusercontent.com/images/0tQJ7SlKdpCZUVbUjxOEy57XRhA.svg",
    width: 96,
    height: 30,
    alt: "Brand logo",
  },
  {
    src: "https://framerusercontent.com/images/hsbt5NG4UUe3LO7ERSFGv8A0PrA.svg",
    width: 94,
    height: 27,
    alt: "Brand logo",
  },
  {
    src: "https://framerusercontent.com/images/O7fimt1JVKhKUjjZOGgeAWTdLQ.svg",
    width: 120,
    height: 25,
    alt: "Brand logo",
  },
  {
    src: "https://framerusercontent.com/images/yg73mxfKVqYxGdl9PXd5goIE.svg",
    width: 80,
    height: 21,
    alt: "Brand logo",
  },
  {
    src: "https://framerusercontent.com/images/6Fbv7vEmmB0WPOWiVDEZNhoZ0.svg",
    width: 68,
    height: 19,
    alt: "Brand logo",
  },
] as const;

function BrandLogoRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      className="flex shrink-0 items-center gap-[100px] pr-[100px]"
      aria-hidden={ariaHidden || undefined}
    >
      {BRAND_LOGOS.map((logo) => (
        <li key={`${ariaHidden ? "clone-" : ""}${logo.src}`} className="shrink-0">
          <Image
            src={logo.src}
            alt={ariaHidden ? "" : logo.alt}
            width={logo.width}
            height={logo.height}
            className="h-auto w-auto max-h-[30px] object-contain opacity-70 grayscale transition-opacity hover:opacity-100"
            loading="lazy"
          />
        </li>
      ))}
    </ul>
  );
}

export function HeroBrandTicker() {
  return (
    <div className="relative border-t border-dashed border-black/[0.06]">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent sm:w-24"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent sm:w-24"
        aria-hidden
      />

      <div className="overflow-hidden py-8 sm:py-10">
        <div className="hero-brand-marquee-track flex w-max">
          <BrandLogoRow />
          <BrandLogoRow ariaHidden />
        </div>
      </div>
    </div>
  );
}
