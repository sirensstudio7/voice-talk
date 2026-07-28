"use client";

import Link from "next/link";

const GRADIENT_CTA =
  "linear-gradient(90deg, rgb(33, 204, 238) 0%, rgb(20, 112, 239) 33.2763%, rgb(105, 39, 218) 68.4697%, rgb(242, 61, 148) 100%)";

const GRADIENT_INNER =
  "linear-gradient(rgb(255, 255, 255) -51%, rgb(16, 2, 2) 18%, rgb(16, 2, 2) 132%)";

type GradientCtaButtonBase = {
  children: React.ReactNode;
  size?: "default" | "compact";
  fullWidth?: boolean;
  className?: string;
};

type GradientCtaLinkProps = GradientCtaButtonBase & {
  href: string;
  onClick?: () => void;
};

type GradientCtaActionProps = GradientCtaButtonBase & {
  href?: undefined;
  onClick: () => void;
  type?: "button";
};

type GradientCtaButtonProps = GradientCtaLinkProps | GradientCtaActionProps;

export function GradientCtaButton(props: GradientCtaButtonProps) {
  const {
    children,
    size = "default",
    fullWidth = false,
    className = "",
    onClick,
  } = props;

  const innerClassName =
    size === "compact"
      ? "relative z-[1] inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white"
      : "relative z-[1] inline-flex min-w-[220px] items-center justify-center rounded-full px-8 py-3.5 text-sm font-medium text-white sm:min-w-[260px] sm:text-[15px]";

  const wrapperClassName = `group relative z-20 inline-flex rounded-full p-[2px] transition-transform hover:scale-[1.02] active:scale-[0.98] ${fullWidth ? "w-full" : ""} ${className}`;

  const content = (
    <>
      <span
        className="pointer-events-none absolute inset-0 rounded-full opacity-70 blur-[17px] transition-opacity group-hover:opacity-90"
        style={{ background: GRADIENT_CTA }}
        aria-hidden
      />
      <span
        className={`${innerClassName} ${fullWidth ? "w-full" : ""}`}
        style={{ background: GRADIENT_INNER }}
      >
        {children}
      </span>
    </>
  );

  if ("href" in props && props.href) {
    const isExternal = /^https?:\/\//i.test(props.href);
    if (isExternal) {
      return (
        <a
          href={props.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className={wrapperClassName}
          style={{ background: GRADIENT_CTA }}
        >
          {content}
        </a>
      );
    }

    return (
      <Link
        href={props.href}
        onClick={onClick}
        className={wrapperClassName}
        style={{ background: GRADIENT_CTA }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={wrapperClassName}
      style={{ background: GRADIENT_CTA }}
    >
      {content}
    </button>
  );
}
