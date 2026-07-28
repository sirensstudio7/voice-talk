const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(
      typeof data?.detail === "string" ? data.detail : "Request failed",
      res.status,
    );
  }
  return data as T;
}

export type PlatformAdmin = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  totp_enabled: boolean;
  force_password_reset: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  workspace_count: number;
  plan: string;
  created_at: string;
  last_login_at: string | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export type DashboardResponse = {
  metrics: {
    total_users: number;
    active_users_30d: number;
    pending_users: number;
    new_demo_requests: number;
    total_workspaces: number;
    active_subscriptions: number;
    manual_mrr: number;
    voice_minutes_this_month: number;
    whatsapp_messages_this_month: number;
  };
  users: Paginated<PlatformUser>;
  recent_signups: PlatformUser[];
};

export type DemoRequestItem = {
  id: string;
  email: string;
  phone: string;
  company_name: string;
  city: string;
  country: string;
  business_industry: string;
  branch_total: number;
  preferred_date: string | null;
  preferred_time: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type BusinessListItem = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  status: string;
  plan: string;
  subscription_status: string;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string;
};

export type SubscriptionItem = {
  id: string;
  business_id: string;
  business_name: string;
  slug: string;
  plan_name: string;
  billing_cycle: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  updated_at: string;
};

export type AuditLogItem = {
  id: string;
  admin_id: string;
  admin_email: string | null;
  admin_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: unknown;
  ip_address: string;
  user_agent: string;
  created_at: string;
};

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  login(email: string, password: string) {
    return request<{
      access_token: string;
      token_type: string;
      admin: PlatformAdmin;
    }>("/platform/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  setup2fa(pendingToken: string) {
    return request<{ secret: string; otpauth_url: string }>("/platform/auth/setup-2fa", {
      method: "POST",
      token: pendingToken,
    });
  },
  verify2fa(pendingToken: string, code: string) {
    return request<{ access_token: string; admin: PlatformAdmin }>("/platform/auth/verify-2fa", {
      method: "POST",
      token: pendingToken,
      body: JSON.stringify({ code }),
    });
  },
  me(token: string) {
    return request<PlatformAdmin>("/platform/auth/me", { token });
  },
  logout(token: string) {
    return request<{ ok: boolean }>("/platform/auth/logout", { method: "POST", token });
  },
  dashboard(
    token: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ) {
    return request<DashboardResponse>(`/platform/dashboard${qs(params)}`, { token });
  },
  listUsers(
    token: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ) {
    return request<Paginated<PlatformUser>>(`/platform/users${qs(params)}`, { token });
  },
  getUser(token: string, id: string) {
    return request<{
      id: string;
      name: string;
      email: string;
      phone: string | null;
      status: string;
      created_at: string;
      last_login_at: string | null;
      workspaces: Array<{
        id: string;
        name: string;
        slug: string;
        is_active: boolean;
        role: string;
        plan: string;
        subscription_status: string;
        created_at: string;
      }>;
      audit_logs: Array<{
        id: string;
        action: string;
        admin_id: string;
        metadata: unknown;
        created_at: string;
      }>;
    }>(`/platform/users/${id}`, { token });
  },
  setUserStatus(token: string, id: string, status: "active" | "suspended") {
    return request<{ id: string; status: string }>(`/platform/users/${id}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    });
  },
  resetUserPassword(token: string, id: string) {
    return request<{ temporary_password: string; note: string }>(
      `/platform/users/${id}/reset-password`,
      { method: "POST", token },
    );
  },
  listBusinesses(
    token: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ) {
    return request<Paginated<BusinessListItem>>(`/platform/businesses${qs(params)}`, { token });
  },
  getBusiness(token: string, id: string) {
    return request<{
      id: string;
      name: string;
      slug: string;
      tagline: string;
      status: string;
      business_type: string;
      primary_use_case: string;
      gemini_model: string;
      created_at: string;
      assistants_count: number;
      products_count: number;
      voice_sessions_count: number;
      whatsapp_status: string;
      storage_usage_bytes: number;
      members: Array<{ id: string; name: string; email: string; role: string }>;
      subscription: {
        id: string;
        plan_name: string;
        billing_cycle: string;
        status: string;
        start_date: string | null;
        end_date: string | null;
        notes: string;
      };
    }>(`/platform/businesses/${id}`, { token });
  },
  setBusinessStatus(token: string, id: string, status: "active" | "disabled") {
    return request<{ id: string; status: string }>(`/platform/businesses/${id}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    });
  },
  impersonate(token: string, id: string) {
    return request<{
      access_token: string;
      business_id: string;
      redirect_url: string;
      merchant_admin_url: string;
      user: { id: string; email: string; name: string };
    }>(`/platform/businesses/${id}/impersonate`, { method: "POST", token });
  },
  listSubscriptions(
    token: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ) {
    return request<Paginated<SubscriptionItem>>(`/platform/subscriptions${qs(params)}`, {
      token,
    });
  },
  updateSubscription(
    token: string,
    id: string,
    body: Partial<{
      plan_name: string;
      billing_cycle: string;
      status: string;
      start_date: string | null;
      end_date: string | null;
      notes: string;
    }>,
  ) {
    return request(`/platform/subscriptions/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },
  getSettings(token: string) {
    return request<Record<string, string>>("/platform/settings", { token });
  },
  updateSettings(token: string, body: Record<string, string>) {
    return request<Record<string, string>>("/platform/settings", {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },
  listAuditLogs(token: string, params: { page?: number; limit?: number } = {}) {
    return request<Paginated<AuditLogItem>>(`/platform/audit-logs${qs(params)}`, { token });
  },
  listDemoRequests(
    token: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ) {
    return request<Paginated<DemoRequestItem>>(`/platform/demo-requests${qs(params)}`, {
      token,
    });
  },
  updateDemoRequest(
    token: string,
    id: string,
    body: Partial<{ status: string; notes: string }>,
  ) {
    return request<DemoRequestItem>(`/platform/demo-requests/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },
};
