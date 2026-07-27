import Image from "next/image";

import logoSrc from "@/assets/lorescale-logo.png";
import { cn } from "@/lib/cn";

type LorescaleLogoProps = {
  className?: string;
};

export function LorescaleLogo({ className }: LorescaleLogoProps) {
  return (
    <Image
      src={logoSrc}
      alt=""
      width={64}
      height={64}
      priority
      className={cn("h-9 w-auto", className)}
      aria-hidden
    />
  );
}
