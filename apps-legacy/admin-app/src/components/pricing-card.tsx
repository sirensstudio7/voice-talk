import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

function PricingCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative flex w-full flex-col rounded-xl border border-border/80 bg-card p-1.5 shadow-xl backdrop-blur-xl",
        "dark:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

function PricingHeader({
  className,
  children,
  glassEffect = true,
  ...props
}: ComponentProps<"div"> & {
  glassEffect?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-muted/80 p-5 dark:bg-muted/50",
        className,
      )}
      {...props}
    >
      {glassEffect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-[inherit]"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 40%, rgba(0,0,0,0) 100%)",
          }}
        />
      ) : null}
      <div className="relative flex flex-col gap-4">{children}</div>
    </div>
  );
}

function PricingPlan({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-start justify-between gap-2", className)} {...props} />;
}

function PricingDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "mt-1.5 min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function PricingPlanName({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-sm font-semibold text-foreground [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function PricingBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-foreground/15 bg-background/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80",
        className,
      )}
      {...props}
    />
  );
}

function PricingPrice({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-[2.75rem] min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}
      {...props}
    />
  );
}

function PricingMainPrice({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "font-extrabold leading-none tracking-tight tabular-nums text-foreground",
        "text-2xl",
        className,
      )}
      {...props}
    />
  );
}

function PricingPeriod({ className, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("text-sm font-medium text-muted-foreground", className)} {...props} />
  );
}

function PricingPricePrefix({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("basis-full text-[11px] font-medium uppercase tracking-wide text-muted-foreground", className)}
      {...props}
    />
  );
}

function PricingOriginalPrice({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("text-sm text-muted-foreground line-through", className)}
      {...props}
    />
  );
}

function PricingBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-1 flex-col gap-5 p-4 pt-5", className)} {...props} />;
}

function PricingList({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("flex flex-1 flex-col gap-2.5", className)} {...props} />;
}

function PricingListItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={cn("flex items-start gap-2.5 text-sm leading-snug text-muted-foreground", className)}
      {...props}
    />
  );
}

function PricingSeparator({
  children = "Upgrade to access",
  className,
  ...props
}: ComponentProps<"div"> & {
  children?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 text-xs text-muted-foreground", className)} {...props}>
      <span className="h-px flex-1 bg-border" />
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export {
  PricingCard,
  PricingHeader,
  PricingDescription,
  PricingPlan,
  PricingPlanName,
  PricingBadge,
  PricingPrice,
  PricingPricePrefix,
  PricingMainPrice,
  PricingPeriod,
  PricingOriginalPrice,
  PricingBody,
  PricingList,
  PricingListItem,
  PricingSeparator,
};
