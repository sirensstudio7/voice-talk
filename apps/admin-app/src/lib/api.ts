import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { BusinessCapabilities, PrimaryUseCase } from "@voicetalk/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Business = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  voice_name: string;
  gemini_model: string;
  is_active: boolean;
  business_type?: string;
  primary_use_case?: PrimaryUseCase;
  onboarding_completed?: boolean;
  capabilities?: BusinessCapabilities;
};

export type Product = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  discount_percent: number;
  category: string;
  description: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
  duration_min?: number;
};

export type Appointment = {
  id: string;
  product_id: string;
  treatment_name: string;
  customer_name: string;
  customer_phone: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
};

export type BusinessHour = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
};

export type KnowledgeEntry = {
  id: string;
  category: string;
  content: string;
  sort_order: number;
};

export type AiTone = "friendly" | "professional" | "casual";
export type AiLanguage = "id" | "en";

export type AiRules = {
  id: string;
  assistant_name: string;
  avatar_url: string;
  personality: string;
  tone: AiTone;
  language: AiLanguage;
  behavioral_rules: string;
  tool_instructions: string;
  idle_timeout_seconds: number;
};

export type OrderItem = {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
};

export type Order = {
  id: string;
  status: string;
  total: number;
  customer_name?: string | null;
  created_at: string;
  confirmed_at: string | null;
  items: OrderItem[];
};

export type StatsOverview = {
  sessions_today: number;
  orders_today: number;
  revenue_today: number;
  avg_order_value: number;
  active_sessions: number;
  avg_call_duration_seconds: number | null;
};

export type TranscriptMessage = {
  id: string;
  role: string;
  text: string;
  created_at: string;
};

export type VoiceSession = {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  duration_seconds: number | null;
  message_count: number;
  order_id: string | null;
  order_total: number | null;
};

export type VoiceSessionDetail = VoiceSession & {
  messages: TranscriptMessage[];
};

export type StatsDailyPoint = {
  date: string;
  orders: number;
  revenue: number;
};

export type TopProductStat = {
  product_id: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type PaymentSettings = {
  payment_qr_url: string;
};

export type AppearanceSettings = {
  background_url: string;
  gradient_color: string;
};

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function apiFetchErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "Can't connect to the API. Run npm run api:ensure in the project root, then retry.";
  }
  return error instanceof Error ? error.message : "Request failed.";
}

function parseErrorMessage(text: string, fallback: string): string {
  try {
    const json = JSON.parse(text) as { detail?: string };
    return json.detail ?? text ?? fallback;
  } catch {
    return text || fallback;
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...authHeaders(token),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new Error(apiFetchErrorMessage(error));
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ApiRequestError(parseErrorMessage(text, response.statusText), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function uploadRequest<T>(path: string, token: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch (error) {
    throw new Error(apiFetchErrorMessage(error));
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ApiRequestError(parseErrorMessage(text, response.statusText), response.status);
  }

  return response.json() as Promise<T>;
}

export type HealthStatus = {
  status: string;
  model: string;
  ai_online: boolean;
};

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetchWithTimeout(`${API_URL}/health`, {}, 15000);
  if (!response.ok) {
    throw new Error("Health check failed");
  }
  return response.json() as Promise<HealthStatus>;
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiRequestError(parseErrorMessage(text, "Invalid credentials"), response.status);
  }
  return response.json() as Promise<{ access_token: string; user: { id: string; email: string; name: string } }>;
}

export async function signup(email: string, password: string, name?: string) {
  const response = await fetch(`${API_URL}/admin/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiRequestError(parseErrorMessage(text, "Sign up failed"), response.status);
  }
  return response.json() as Promise<{ access_token: string; user: { id: string; email: string; name: string } }>;
}

export type SlugCheckResult =
  | { available: true }
  | { available: false; suggestions: string[] };

export const api = {
  listBusinesses: (token: string) => request<Business[]>("/admin/businesses", token),
  checkSlug: (token: string, slug: string) =>
    request<SlugCheckResult>(`/admin/businesses/check-slug?slug=${encodeURIComponent(slug)}`, token),
  createBusiness: (token: string, body: { name: string; slug: string }) =>
    request<Business>("/admin/businesses", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  completeOnboarding: (
    token: string,
    businessId: string,
    body: {
      business_type: string;
      primary_use_case: "orders" | "faqs" | "both" | "appointments";
      language?: "id" | "en";
    },
  ) =>
    request<{ business: Business; ai_rules: AiRules }>(
      `/admin/businesses/${businessId}/onboarding`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),
  listProducts: (token: string, businessId: string) =>
    request<Product[]>(`/admin/businesses/${businessId}/products`, token),
  createProduct: (token: string, businessId: string, body: Partial<Product>) =>
    request<Product>(`/admin/businesses/${businessId}/products`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateProduct: (token: string, businessId: string, id: string, body: Partial<Product>) =>
    request<Product>(`/admin/businesses/${businessId}/products/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteProduct: (token: string, businessId: string, id: string) =>
    request<void>(`/admin/businesses/${businessId}/products/${id}`, token, { method: "DELETE" }),
  uploadProductImage: (token: string, businessId: string, file: File) =>
    uploadRequest<{ image_url: string }>(`/admin/businesses/${businessId}/product-images`, token, file),
  listKnowledge: (token: string, businessId: string) =>
    request<KnowledgeEntry[]>(`/admin/businesses/${businessId}/knowledge`, token),
  createKnowledge: (token: string, businessId: string, body: { category: string; content: string }) =>
    request<KnowledgeEntry>(`/admin/businesses/${businessId}/knowledge`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateKnowledge: (token: string, businessId: string, id: string, body: Partial<KnowledgeEntry>) =>
    request<KnowledgeEntry>(`/admin/businesses/${businessId}/knowledge/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteKnowledge: (token: string, businessId: string, id: string) =>
    request<void>(`/admin/businesses/${businessId}/knowledge/${id}`, token, { method: "DELETE" }),
  getAiRules: (token: string, businessId: string) =>
    request<AiRules>(`/admin/businesses/${businessId}/ai-rules`, token),
  updateAiRules: (token: string, businessId: string, body: Partial<AiRules>) =>
    request<AiRules>(`/admin/businesses/${businessId}/ai-rules`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  uploadAssistantAvatar: (token: string, businessId: string, file: File) =>
    uploadRequest<AiRules>(`/admin/businesses/${businessId}/ai-rules/avatar`, token, file),
  deleteAssistantAvatar: (token: string, businessId: string) =>
    request<AiRules>(`/admin/businesses/${businessId}/ai-rules/avatar`, token, {
      method: "DELETE",
    }),
  getPromptPreview: (token: string, businessId: string) =>
    request<{ system_instruction: string }>(`/admin/businesses/${businessId}/prompt-preview`, token),
  listOrders: (token: string, businessId: string, date?: string) => {
    const params = new URLSearchParams();
    if (date) {
      params.set("date", date);
      params.set("tz_offset", String(new Date().getTimezoneOffset()));
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return request<Order[]>(`/admin/businesses/${businessId}/orders${query}`, token);
  },
  listConversations: (token: string, businessId: string, date?: string) => {
    const params = new URLSearchParams();
    if (date) {
      params.set("date", date);
      params.set("tz_offset", String(new Date().getTimezoneOffset()));
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return request<VoiceSession[]>(`/admin/businesses/${businessId}/conversations${query}`, token);
  },
  getConversation: (token: string, businessId: string, sessionId: string) =>
    request<VoiceSessionDetail>(`/admin/businesses/${businessId}/conversations/${sessionId}`, token),
  statsOverview: (token: string, businessId: string) =>
    request<StatsOverview>(`/admin/businesses/${businessId}/stats/overview`, token),
  statsDaily: (token: string, businessId: string) =>
    request<StatsDailyPoint[]>(`/admin/businesses/${businessId}/stats/daily`, token),
  statsTopProducts: (token: string, businessId: string) =>
    request<TopProductStat[]>(`/admin/businesses/${businessId}/stats/top-products`, token),
  getPaymentSettings: (token: string, businessId: string) =>
    request<PaymentSettings>(`/admin/businesses/${businessId}/payment`, token),
  uploadPaymentQr: (token: string, businessId: string, file: File) =>
    uploadRequest<PaymentSettings>(`/admin/businesses/${businessId}/payment/qr`, token, file),
  deletePaymentQr: (token: string, businessId: string) =>
    request<PaymentSettings>(`/admin/businesses/${businessId}/payment/qr`, token, {
      method: "DELETE",
    }),
  getAppearanceSettings: (token: string, businessId: string) =>
    request<AppearanceSettings>(`/admin/businesses/${businessId}/appearance`, token),
  updateAppearanceSettings: (
    token: string,
    businessId: string,
    body: { gradient_color?: string },
  ) =>
    request<AppearanceSettings>(`/admin/businesses/${businessId}/appearance`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  uploadBackground: (token: string, businessId: string, file: File) =>
    uploadRequest<AppearanceSettings>(
      `/admin/businesses/${businessId}/appearance/background`,
      token,
      file,
    ),
  deleteBackground: (token: string, businessId: string) =>
    request<AppearanceSettings>(`/admin/businesses/${businessId}/appearance/background`, token, {
      method: "DELETE",
    }),
  listAppointments: (token: string, businessId: string, date?: string) => {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<Appointment[]>(`/admin/businesses/${businessId}/appointments${query}`, token);
  },
  cancelAppointment: (token: string, businessId: string, appointmentId: string) =>
    request<Appointment>(
      `/admin/businesses/${businessId}/appointments/${appointmentId}/cancel`,
      token,
      { method: "PATCH" },
    ),
  getSchedule: (token: string, businessId: string) =>
    request<BusinessHour[]>(`/admin/businesses/${businessId}/schedule`, token),
  saveSchedule: (token: string, businessId: string, hours: BusinessHour[]) =>
    request<BusinessHour[]>(`/admin/businesses/${businessId}/schedule`, token, {
      method: "PUT",
      body: JSON.stringify({ hours }),
    }),
};
