const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 45_000;

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null; timeoutMs?: number } = {},
): Promise<T> {
  const { token, headers, timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
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
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiRequestError(
        "Request timed out. The API may still be starting after a deploy — wait a few seconds and retry.",
        408,
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
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
  has_custom_api_keys?: boolean;
  created_at: string;
  last_login_at: string | null;
};

export type UserApiKeyCatalogItem = {
  id: string;
  provider: string;
  label: string;
};

export type UserApiKeyAssignment = {
  source_id: string | null;
  catalog: UserApiKeyCatalogItem[];
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
    pending_subscription_requests?: number;
    total_workspaces: number;
    active_subscriptions: number;
    manual_mrr: number;
    voice_minutes_this_month: number;
    whatsapp_messages_this_month: number;
  };
  users: Paginated<PlatformUser>;
  recent_signups: PlatformUser[];
};

export type SubscriptionRequestItem = {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  notes: string;
  customer: { id: string; name: string; email: string };
  requested_plan: { code: string; name: string; workspace_limit: number };
  trial_ends_at: string | null;
  entitlement_status: string | null;
};

export type AddonRequestItem = {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  notes: string;
  payment_proof_url: string | null;
  transaction_code: string;
  addon: { code: string; name: string };
  workspace: { id: string; name: string; slug: string };
  owner: { id: string; name: string; email: string };
};

export type SubscriptionRequestDetail = {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string;
  customer: { id: string; name: string; email: string; phone: string };
  requested_plan: { code: string; name: string; workspace_limit: number };
  entitlement: {
    status: string;
    plan_code: string;
    plan_name: string;
    workspace_limit: number;
    workspace_count: number;
    trial_started_at: string | null;
    trial_ends_at: string | null;
    starts_at: string | null;
    ends_at: string | null;
  };
  available_plans: Array<{ code: string; name: string; workspace_limit: number }>;
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

export type VisionWorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  camera_trigger_enabled: boolean;
  vision_source: "auto" | "python" | "browser" | "human";
  greeting_trigger_mode: "presence" | "gesture" | "raise_hand";
  updated_at: string | null;
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
  lore_minutes_monthly: number;
  lore_minutes_used: number;
};

export type SubscriptionsResponse = Paginated<SubscriptionItem> & {
  summary: {
    minutes_used: number;
    minutes_included: number;
    price_idr_monthly: number;
    price_usd_monthly: number;
    gemini_usd_per_minute: number;
    gemini_cost_usd: number;
    gemini_cost_idr: number;
    usd_idr_rate: number;
    usd_idr_updated_at: string | null;
    usd_idr_source: "live" | "manual" | "fallback";
  };
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
  getUserApiKeys(token: string, id: string) {
    return request<UserApiKeyAssignment>(`/platform/users/${id}/api-keys`, { token });
  },
  updateUserApiKeys(token: string, id: string, sourceId: string | null) {
    return request<UserApiKeyAssignment>(`/platform/users/${id}/api-keys`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ source_id: sourceId }),
    });
  },
  listBusinesses(
    token: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ) {
    return request<Paginated<BusinessListItem>>(`/platform/businesses${qs(params)}`, { token });
  },
  listVisionWorkspaces(
    token: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      vision_source?: string;
    } = {},
  ) {
    return request<
      Paginated<VisionWorkspaceItem> & {
        sources: Array<"auto" | "python" | "browser" | "human">;
      }
    >(`/platform/vision${qs(params)}`, { token });
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
    return request<SubscriptionsResponse>(`/platform/subscriptions${qs(params)}`, {
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
  listSubscriptionRequests(
    token: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ) {
    return request<Paginated<SubscriptionRequestItem>>(
      `/platform/subscription-requests${qs(params)}`,
      { token },
    );
  },
  getSubscriptionRequest(token: string, id: string) {
    return request<SubscriptionRequestDetail>(`/platform/subscription-requests/${id}`, { token });
  },
  activateSubscriptionRequest(
    token: string,
    id: string,
    body: {
      plan_code?: string;
      duration_months?: number;
      custom_ends_at?: string;
      notes?: string;
    },
  ) {
    return request<{ id: string; status: string; entitlement: unknown }>(
      `/platform/subscription-requests/${id}/activate`,
      {
        method: "POST",
        token,
        body: JSON.stringify(body),
      },
    );
  },
  rejectSubscriptionRequest(token: string, id: string, notes?: string) {
    return request<{ id: string; status: string }>(
      `/platform/subscription-requests/${id}/reject`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ notes: notes ?? "" }),
      },
    );
  },
  listAddonRequests(
    token: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ) {
    return request<Paginated<AddonRequestItem>>(`/platform/addon-requests${qs(params)}`, {
      token,
    });
  },
  approveAddonRequest(
    token: string,
    id: string,
    body: { duration_months?: number; custom_ends_at?: string; notes?: string } = {},
  ) {
    return request<{ id: string; status: string }>(`/platform/addon-requests/${id}/approve`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },
  listTopupOrders(
    token: string,
    params: { status?: string; search?: string } = {},
  ) {
    return request<{
      items: Array<{
        id: string;
        user_id: string;
        user_email: string;
        user_name: string;
        package_name: string;
        minutes: number;
        price_idr: number;
        status: string;
        payment_method: string;
        payment_proof_url: string | null;
        transaction_code: string;
        notes: string;
        created_at: string;
        paid_at: string | null;
      }>;
    }>(`/platform/topup-orders${qs(params)}`, { token });
  },
  approveTopupOrder(token: string, id: string) {
    return request<{ id: string; status: string }>(`/platform/topup-orders/${id}/approve`, {
      method: "POST",
      token,
    });
  },
  rejectTopupOrder(token: string, id: string, notes?: string) {
    return request<{ id: string; status: string }>(`/platform/topup-orders/${id}/reject`, {
      method: "POST",
      token,
      body: JSON.stringify({ notes: notes ?? "" }),
    });
  },
  getUserVoiceMinutes(token: string, userId: string) {
    return request<{
      wallet: {
        included_seconds: number;
        included_used_seconds: number;
        purchased_remaining_seconds: number;
        available_seconds: number;
        period_start: string | null;
        period_end: string | null;
        warning: string | null;
      };
      ledger: Array<{
        id: string;
        type: string;
        delta_seconds: number;
        balance_after_seconds: number;
        created_at: string;
      }>;
    }>(`/platform/users/${userId}/voice-minutes`, { token });
  },
  adjustUserVoiceMinutes(token: string, userId: string, seconds: number, note?: string) {
    return request<{ available_seconds: number }>(`/platform/users/${userId}/voice-minutes/adjust`, {
      method: "POST",
      token,
      body: JSON.stringify({ seconds, note }),
    });
  },
  rejectAddonRequest(token: string, id: string, notes?: string) {
    return request<{ id: string; status: string }>(`/platform/addon-requests/${id}/reject`, {
      method: "POST",
      token,
      body: JSON.stringify({ notes: notes ?? "" }),
    });
  },
  suspendAddonRequest(token: string, id: string, notes?: string) {
    return request<{ id: string; status: string }>(`/platform/addon-requests/${id}/suspend`, {
      method: "POST",
      token,
      body: JSON.stringify({ notes: notes ?? "" }),
    });
  },
  getPricing(token: string) {
    return request<{
      plans: Array<{
        id: string;
        code: string;
        name: string;
        is_trial: boolean;
        workspace_limit: number;
        kiosk_display_limit: number;
        monthly_price_idr: number;
        yearly_price_idr: number;
        yearly_discount_percent: number;
        monthly_voice_minutes: number;
      }>;
      addons: Array<{
        id: string;
        code: string;
        name: string;
        description: string;
        price_display: string;
        monthly_price_idr: number;
        discount_3m_percent: number;
        discount_6m_percent: number;
        discount_12m_percent: number;
      }>;
      topup_packages: Array<{
        id: string;
        code: string;
        name: string;
        minutes: number;
        price_idr: number;
        discount_percent: number;
        expires_after_days: number;
        is_popular: boolean;
        status: string;
      }>;
    }>("/platform/pricing", { token });
  },
  updatePlanPricing(
    token: string,
    code: string,
    body: {
      monthly_price_idr?: number;
      yearly_price_idr?: number;
      yearly_discount_percent?: number;
      monthly_voice_minutes?: number;
      workspace_limit?: number;
      kiosk_display_limit?: number;
    },
  ) {
    return request(`/platform/pricing/plans/${code}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },
  updateAddonPricing(
    token: string,
    code: string,
    body: {
      monthly_price_idr?: number;
      discount_3m_percent?: number;
      discount_6m_percent?: number;
      discount_12m_percent?: number;
    },
  ) {
    return request(`/platform/pricing/addons/${code}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },
  updateTopupPackagePricing(
    token: string,
    id: string,
    body: { price_idr?: number; minutes?: number; discount_percent?: number },
  ) {
    return request(`/platform/pricing/topup-packages/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },
};
