/** Account / auth routes that must not be claimed as workspace slugs. */
export const RESERVED_ADMIN_SLUGS = [
  "login",
  "signup",
  "onboarding",
  "billing",
  "workspaces",
  "transactions",
  "settings",
  "api",
  "_next",
] as const;

const RESERVED_SET = new Set<string>(RESERVED_ADMIN_SLUGS);

/** Business-scoped top-level path segments (for legacy redirects). */
export const BUSINESS_SCOPED_ROOTS = [
  "analytics",
  "menu",
  "appointments",
  "schedule",
  "orders",
  "payment",
  "knowledge",
  "presentations",
  "sessions",
  "ai-rules",
  "vision-settings",
  "conversations",
  "appearance",
  "add-ons",
] as const;

export function isReservedAdminSlug(slug: string): boolean {
  const key = slug.toLowerCase();
  return (
    RESERVED_SET.has(key) ||
    (BUSINESS_SCOPED_ROOTS as readonly string[]).includes(key)
  );
}

/** Build a business-scoped admin path: adminPath("dunia-fantasi", "/knowledge") → "/dunia-fantasi/knowledge" */
export function adminPath(slug: string, path: string = "/"): string {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return path.startsWith("/") ? path : `/${path}`;

  if (!path || path === "/") return `/${normalizedSlug}`;

  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `/${normalizedSlug}${suffix}`;
}

/**
 * Strip the leading business slug from a pathname.
 * "/dunia-fantasi/knowledge/x" → "/knowledge/x"
 * "/billing" → "/billing" (unchanged when not slug-prefixed)
 */
export function stripBusinessSlug(
  pathname: string,
  knownSlug?: string | null,
): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "/";

  const first = parts[0];
  if (knownSlug && first === knownSlug) {
    const rest = parts.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }

  // If first segment looks like a business slug (not a reserved / scoped root alone at account level)
  if (
    !isReservedAdminSlug(first) &&
    !(BUSINESS_SCOPED_ROOTS as readonly string[]).includes(first)
  ) {
    const rest = parts.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

/** True when pathname is under /{slug}/... for the given slug (or any slug-like first segment). */
export function matchAdminPath(
  pathname: string,
  slug: string,
  hrefSuffix: string,
): boolean {
  const target = adminPath(slug, hrefSuffix);
  if (hrefSuffix === "/" || hrefSuffix === "") {
    return pathname === target || pathname === `/${slug}`;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}
