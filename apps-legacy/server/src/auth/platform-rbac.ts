export const PLATFORM_ROLES = ["super", "ops", "finance", "support", "readonly"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type PlatformPermission =
  | "dashboard"
  | "users:read"
  | "users:write"
  | "businesses:read"
  | "businesses:write"
  | "subscriptions:read"
  | "subscriptions:write"
  | "demo_requests:read"
  | "demo_requests:write"
  | "settings:write"
  | "admins:write"
  | "audit:read"
  | "impersonate";

const ROLE_PERMISSIONS: Record<PlatformRole, ReadonlySet<PlatformPermission>> = {
  super: new Set([
    "dashboard",
    "users:read",
    "users:write",
    "businesses:read",
    "businesses:write",
    "subscriptions:read",
    "subscriptions:write",
    "demo_requests:read",
    "demo_requests:write",
    "settings:write",
    "admins:write",
    "audit:read",
    "impersonate",
  ]),
  ops: new Set([
    "dashboard",
    "users:read",
    "users:write",
    "businesses:read",
    "businesses:write",
    "subscriptions:read",
    "demo_requests:read",
    "demo_requests:write",
    "audit:read",
  ]),
  finance: new Set([
    "dashboard",
    "users:read",
    "businesses:read",
    "subscriptions:read",
    "subscriptions:write",
    "demo_requests:read",
    "audit:read",
  ]),
  support: new Set([
    "dashboard",
    "users:read",
    "businesses:read",
    "subscriptions:read",
    "demo_requests:read",
    "demo_requests:write",
    "audit:read",
  ]),
  readonly: new Set([
    "dashboard",
    "users:read",
    "businesses:read",
    "subscriptions:read",
    "demo_requests:read",
    "audit:read",
  ]),
};

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: string, permission: PlatformPermission): boolean {
  if (!isPlatformRole(role)) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function requirePermission(role: string, permission: PlatformPermission): void {
  if (!hasPermission(role, permission)) {
    const err = new Error("Insufficient permissions") as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
}
