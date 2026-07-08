export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length > 0 && slug.length <= 100;
}

const WORKSPACE_KEY = "lorescale_onboarding_workspace";

export type WorkspaceDraft = {
  name: string;
};

export function loadWorkspaceDraft(): WorkspaceDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(WORKSPACE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceDraft> & { slug?: string };
    if (typeof parsed.name !== "string") return null;
    return { name: parsed.name };
  } catch {
    return null;
  }
}

export function saveWorkspaceDraft(draft: WorkspaceDraft): void {
  sessionStorage.setItem(WORKSPACE_KEY, JSON.stringify(draft));
}

export function clearWorkspaceDraft(): void {
  sessionStorage.removeItem(WORKSPACE_KEY);
}

export type BusinessDraft = {
  business_type?: string;
  primary_use_case?: "orders" | "faqs" | "both" | "appointments";
  language?: "id" | "en";
};

const BUSINESS_KEY = "lorescale_onboarding_business";

export function loadBusinessDraft(): BusinessDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(BUSINESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BusinessDraft;
  } catch {
    return null;
  }
}

export function saveBusinessDraft(draft: BusinessDraft): void {
  sessionStorage.setItem(BUSINESS_KEY, JSON.stringify(draft));
}

export function clearBusinessDraft(): void {
  sessionStorage.removeItem(BUSINESS_KEY);
}

export function clearOnboardingDrafts(): void {
  clearWorkspaceDraft();
  clearBusinessDraft();
}

export function isOnboardingComplete(business: { onboarding_completed?: boolean } | null | undefined): boolean {
  return business?.onboarding_completed === true;
}

export function getOnboardingRedirectPath(
  businesses: { onboarding_completed?: boolean }[],
  business: { onboarding_completed?: boolean } | null,
): "/onboarding/workspace" | "/onboarding/business" | null {
  if (businesses.length === 0) return "/onboarding/workspace";
  if (!isOnboardingComplete(business)) return "/onboarding/business";
  return null;
}
