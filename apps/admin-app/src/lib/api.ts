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
  background_url?: string;
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
  title: string;
  content: string;
  sort_order: number;
};

export type AiTone = "friendly" | "professional" | "casual";
export type AiLanguage = "id" | "en";
export type VoicePreset = "natural" | "dark_beast" | "deep" | "robot" | "bright";
export type VoiceGender = "female" | "male";

export type AiRules = {
  id: string;
  assistant_name: string;
  avatar_url: string;
  avatar_model_path: string;
  personality: string;
  tone: AiTone;
  language: AiLanguage;
  behavioral_rules: string;
  tool_instructions: string;
  idle_timeout_seconds: number;
  voice_preset: VoicePreset;
  voice_gender: VoiceGender;
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

export type StatsSummary = {
  overview: StatsOverview;
  daily: StatsDailyPoint[];
  top_products: TopProductStat[];
  ai_rules: AiRules;
};

export type PaymentSettings = {
  payment_qr_url: string;
};

export type AppearanceSettings = {
  background_url: string;
  gradient_color: string;
  display_orientation: "portrait" | "landscape" | "auto";
};

export type GreetingTriggerMode = "presence" | "gesture" | "raise_hand";

export type VisionSource = "auto" | "python" | "browser";

export type VisionSettings = {
  camera_trigger_enabled: boolean;
  vision_source: VisionSource;
  greeting_trigger_mode: GreetingTriggerMode;
  greeting_delay_seconds: number;
  detection_distance_m: number;
  cooldown_seconds: number;
  lost_timeout_seconds: number;
  silence_timeout_seconds: number;
  auto_goodbye_timeout_seconds: number;
  greeting_script: string;
  goodbye_script: string;
};

export type VisionMetrics = {
  period_days: number;
  person_enter_count: number;
  person_confirmed_count: number;
  greeting_accuracy: number;
  false_greeting_rate: number;
  conversation_start_rate: number;
};

export type SubscriptionPlan = {
  code: string;
  name: string;
  workspace_limit: number;
};

export type AccountSubscription = {
  id: string;
  status: "trialing" | "expired" | "active" | "past_due" | "cancelled" | string;
  plan_code: string;
  plan_name: string;
  workspace_limit: number;
  workspace_count: number;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  service_access: boolean;
  can_create_workspace: boolean;
  pending_request: {
    id: string;
    requested_plan_code: string;
    requested_plan_name: string;
    created_at: string;
  } | null;
};

export type PhotoSettings = {
  enabled: boolean;
  voice_prompt: string;
  countdown_seconds: number;
  qr_expiry_hours: number;
  logo_url: string;
  frame_url: string;
  campaign_text: string;
  auto_delete_days: number;
  updated_at?: string;
  subscription_status?: string;
};

export type PhotoSettingsPatch = {
  enabled: boolean;
  voice_prompt: string;
  countdown_seconds: number;
  qr_expiry_hours: number;
  campaign_text: string | null;
  auto_delete_days: number;
};

export type BillingTransaction = {
  id: string;
  type: "subscription" | "addon";
  title: string;
  subtitle: string;
  status: string;
  amount_label: string | null;
  workspace_name: string | null;
  payment_proof_url: string | null;
  transaction_code: string | null;
  notes: string;
  created_at: string;
  reviewed_at: string | null;
};

export type AddonStatus = {
  addon: {
    code: string;
    name: string;
    description: string;
    price_display: string;
  };
  subscription_status: string;
  starts_at: string | null;
  ends_at: string | null;
  pending_request: { id: string; status: string; created_at: string } | null;
  settings: PhotoSettings;
};

export type PhotoAnalytics = {
  photos_today: number;
  acceptance_rate: number;
  downloads_today: number;
  downloads_this_month: number;
};

export type PhotoGalleryItem = {
  id: string;
  status: string;
  visitor_response: string | null;
  created_at: string;
  downloaded_at: string | null;
  download_expires_at: string | null;
  thumbnail_url: string | null;
  photo_url: string | null;
};

function authHeaders(token: string, hasJsonBody = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
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
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request timed out — the API may be slow or the database unreachable. Wait a moment and retry.";
  }
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
    const hasJsonBody = init?.body != null && init.body !== "";
    response = await fetchWithTimeout(
      `${API_URL}${path}`,
      {
        ...init,
        headers: {
          ...authHeaders(token, hasJsonBody),
          ...(init?.headers ?? {}),
        },
      },
      45000,
    );
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
  db_online?: boolean;
  db_latency_ms?: number | null;
};

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetchWithTimeout(`${API_URL}/health`, {}, 15000);
  if (!response.ok) {
    throw new Error("Health check failed");
  }
  return response.json() as Promise<HealthStatus>;
}

export async function login(email: string, password: string) {
  const response = await fetchWithTimeout(
    `${API_URL}/admin/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    45000,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new ApiRequestError(parseErrorMessage(text, "Invalid credentials"), response.status);
  }
  return response.json() as Promise<{
    access_token: string;
    user: { id: string; email: string; name: string; country?: string };
    businesses: Business[];
  }>;
}

export async function signup(
  email: string,
  password: string,
  name?: string,
  country?: string,
) {
  const response = await fetch(`${API_URL}/admin/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, country }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiRequestError(parseErrorMessage(text, "Sign up failed"), response.status);
  }
  return response.json() as Promise<
    | {
        status: "pending";
        message: string;
        user: { id: string; email: string; name: string; country?: string };
      }
    | { access_token: string; user: { id: string; email: string; name: string; country?: string } }
  >;
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
  deleteBusiness: (token: string, businessId: string) =>
    request<void>(`/admin/businesses/${businessId}`, token, { method: "DELETE" }),
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
  createKnowledge: (
    token: string,
    businessId: string,
    body: { category: string; title?: string; content: string },
  ) =>
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
  exportConversations: (token: string, businessId: string, date?: string) => {
    const params = new URLSearchParams();
    if (date) {
      params.set("date", date);
      params.set("tz_offset", String(new Date().getTimezoneOffset()));
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return request<VoiceSessionDetail[]>(
      `/admin/businesses/${businessId}/conversations/export${query}`,
      token,
    );
  },
  statsOverview: (token: string, businessId: string) =>
    request<StatsOverview>(`/admin/businesses/${businessId}/stats/overview`, token),
  statsDaily: (token: string, businessId: string) =>
    request<StatsDailyPoint[]>(`/admin/businesses/${businessId}/stats/daily`, token),
  statsTopProducts: (token: string, businessId: string) =>
    request<TopProductStat[]>(`/admin/businesses/${businessId}/stats/top-products`, token),
  statsSummary: (token: string, businessId: string) =>
    request<StatsSummary>(`/admin/businesses/${businessId}/stats/summary`, token),
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
    body: { gradient_color?: string; display_orientation?: "portrait" | "landscape" | "auto" },
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
  getVisionSettings: (token: string, businessId: string) =>
    request<VisionSettings>(`/admin/businesses/${businessId}/vision-settings`, token),
  updateVisionSettings: (token: string, businessId: string, body: Partial<VisionSettings>) =>
    request<VisionSettings>(`/admin/businesses/${businessId}/vision-settings`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getVisionMetrics: (token: string, businessId: string, days = 7) =>
    request<VisionMetrics>(
      `/admin/businesses/${businessId}/vision-metrics?days=${days}`,
      token,
    ),
  getSubscription: (token: string) =>
    request<AccountSubscription>(`/admin/subscription/me`, token),
  listTransactions: (token: string) =>
    request<{ items: BillingTransaction[] }>(`/admin/transactions`, token),
  listSubscriptionPlans: (token: string) =>
    request<SubscriptionPlan[]>(`/admin/subscription/plans`, token),
  requestSubscriptionPlan: (token: string, plan_code: string) =>
    request<{
      id: string;
      requested_plan: SubscriptionPlan;
      status: string;
      entitlement: AccountSubscription;
    }>(`/admin/subscription/request`, token, {
      method: "POST",
      body: JSON.stringify({ plan_code }),
    }),
  getAddonStatus: (token: string, businessId: string, code = "smart_photo_moment") =>
    request<AddonStatus>(`/admin/businesses/${businessId}/addons/${code}`, token),
  requestAddon: (
    token: string,
    businessId: string,
    code = "smart_photo_moment",
    body?: {
      duration_months?: number;
      payment_method?: string;
      billing_name?: string;
      billing_email?: string;
      billing_phone?: string;
      company?: string;
      notes?: string;
      payment_proof_url?: string;
      transaction_code?: string;
      amount_display?: string;
      amount_idr?: number;
    },
  ) =>
    request<{
      id: string;
      status: string;
      transaction_code: string;
      addon: { code: string; name: string; price_display: string };
    }>(
      `/admin/businesses/${businessId}/addons/${code}/request`,
      token,
      { method: "POST", body: JSON.stringify(body ?? {}) },
    ),
  uploadAddonPaymentProof: (token: string, businessId: string, file: File) =>
    uploadRequest<{ url: string }>(
      `/admin/businesses/${businessId}/addons/payment-proof`,
      token,
      file,
    ),
  getPhotoSettings: (token: string, businessId: string) =>
    request<PhotoSettings>(`/admin/businesses/${businessId}/photo/settings`, token),
  updatePhotoSettings: (token: string, businessId: string, body: Partial<PhotoSettingsPatch>) =>
    request<PhotoSettings>(`/admin/businesses/${businessId}/photo/settings`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  uploadPhotoBranding: (token: string, businessId: string, kind: "logo" | "frame", file: File) =>
    uploadRequest<PhotoSettings>(
      `/admin/businesses/${businessId}/photo/branding/${kind}`,
      token,
      file,
    ),
  deletePhotoBranding: (token: string, businessId: string, kind: "logo" | "frame") =>
    request<PhotoSettings>(`/admin/businesses/${businessId}/photo/branding/${kind}`, token, {
      method: "DELETE",
    }),
  getPhotoAnalytics: (token: string, businessId: string) =>
    request<PhotoAnalytics>(`/admin/businesses/${businessId}/photo/analytics`, token),
  listPhotoGallery: (
    token: string,
    businessId: string,
    params?: { from?: string; to?: string; limit?: number; offset?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.size ? `?${qs.toString()}` : "";
    return request<{ items: PhotoGalleryItem[]; total: number }>(
      `/admin/businesses/${businessId}/photo/gallery${query}`,
      token,
    );
  },
  deletePhotoGalleryItem: (token: string, businessId: string, sessionId: string) =>
    request<{ ok: boolean }>(
      `/admin/businesses/${businessId}/photo/gallery/${sessionId}`,
      token,
      { method: "DELETE" },
    ),
  updateProfile: (token: string, body: { country?: string }) =>
    request<{ id: string; email: string; name: string; country?: string }>(
      `/admin/auth/me`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),

  listPresentations: (token: string, businessId: string) =>
    request<Presentation[]>(`/admin/businesses/${businessId}/presentations`, token),
  createPresentation: (
    token: string,
    businessId: string,
    body: { title: string; description?: string; language?: string; category?: string },
  ) =>
    request<Presentation>(`/admin/businesses/${businessId}/presentations`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getPresentation: (token: string, businessId: string, presentationId: string) =>
    request<PresentationDetail>(
      `/admin/businesses/${businessId}/presentations/${presentationId}`,
      token,
    ),
  /** Absolute URL to fetch the uploaded PPTX with the admin bearer token. */
  presentationPptxUrl: (businessId: string, presentationId: string) =>
    `${API_URL}/admin/businesses/${businessId}/presentations/${presentationId}/pptx`,
  /** Absolute URL to stream a narration audio asset with the admin bearer token. */
  presentationAudioUrl: (businessId: string, presentationId: string, assetId: string) =>
    `${API_URL}/admin/businesses/${businessId}/presentations/${presentationId}/audio/${assetId}`,
  deletePresentation: (token: string, businessId: string, presentationId: string) =>
    request<void>(`/admin/businesses/${businessId}/presentations/${presentationId}`, token, {
      method: "DELETE",
    }),
  uploadPresentationFile: (
    token: string,
    businessId: string,
    presentationId: string,
    file: File,
  ) =>
    uploadRequest<PresentationFile>(
      `/admin/businesses/${businessId}/presentations/${presentationId}/files`,
      token,
      file,
    ),
  processPresentation: (token: string, businessId: string, presentationId: string) =>
    request<Presentation>(
      `/admin/businesses/${businessId}/presentations/${presentationId}/process`,
      token,
      { method: "POST", body: JSON.stringify({}) },
    ),
  launchPresentationSession: (
    token: string,
    businessId: string,
    presentationId: string,
    body?: { name?: string; enable_qna?: boolean; auto_start?: boolean },
  ) =>
    request<PresentationSession>(
      `/admin/businesses/${businessId}/presentations/${presentationId}/sessions`,
      token,
      { method: "POST", body: JSON.stringify(body ?? {}) },
    ),
  getPresentationSession: (token: string, businessId: string, sessionId: string) =>
    request<PresentationSessionDetail>(
      `/admin/businesses/${businessId}/sessions/${sessionId}`,
      token,
    ),
  controlPresentationSession: (
    token: string,
    businessId: string,
    sessionId: string,
    action: string,
  ) =>
    request<PresentationSession>(
      `/admin/businesses/${businessId}/sessions/${sessionId}/control`,
      token,
      { method: "POST", body: JSON.stringify({ action }) },
    ),
  askPresentationQuestion: (
    token: string,
    businessId: string,
    sessionId: string,
    question: string,
  ) =>
    request<PresentationQuestion>(
      `/admin/businesses/${businessId}/sessions/${sessionId}/questions`,
      token,
      { method: "POST", body: JSON.stringify({ question }) },
    ),
  getPresentationSessionAnalytics: (token: string, businessId: string, sessionId: string) =>
    request<PresentationSessionAnalytics>(
      `/admin/businesses/${businessId}/sessions/${sessionId}/analytics`,
      token,
    ),
};

export type Presentation = {
  id: string;
  business_id: string;
  title: string;
  description: string;
  language: string;
  category: string;
  status: string;
  processing_step: string;
  processing_error: string;
  total_slides: number;
  estimated_duration: number;
  greeting_script: string;
  closing_script: string;
  created_at: string;
  updated_at: string;
};

export type PresentationFile = {
  id: string;
  presentation_id: string;
  file_name: string;
  file_type: string;
  size_bytes: number;
  storage_path: string;
  status: string;
  created_at: string;
};

export type PresentationSlide = {
  id: string;
  presentation_id: string;
  slide_number: number;
  title: string;
  content: { texts?: string[] };
  notes: string;
  script: string;
  image_url: string;
  duration_seconds: number;
};

export type PresentationAudioAsset = {
  id: string;
  slide_id: string;
  kind: string;
  provider?: string;
  storage_path: string;
  duration_seconds: number;
};

export type PresentationDetail = Presentation & {
  files: PresentationFile[];
  slides: PresentationSlide[];
  audio_assets: PresentationAudioAsset[];
  pptx_url?: string | null;
};

export type PresentationSession = {
  id: string;
  presentation_id: string;
  business_id: string;
  name: string;
  status: string;
  current_slide_number: number;
  enable_qna: boolean;
  auto_start: boolean;
  audience_count: number;
  question_count: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PresentationQuestion = {
  id: string;
  session_id: string;
  question: string;
  answer: string;
  status: string;
  moderation_result: unknown;
  source_references: unknown;
  created_at: string;
  answered_at: string | null;
};

export type PresentationSessionDetail = {
  session: PresentationSession;
  presentation: Presentation | null;
  slides: PresentationSlide[];
  questions: PresentationQuestion[];
  audio_assets: PresentationAudioAsset[];
  pptx_url?: string | null;
};

export type PresentationSessionAnalytics = {
  session_id: string;
  status: string;
  audience_count: number;
  question_count: number;
  answered_count: number;
  blocked_count: number;
  session_duration_seconds: number;
  completion_rate: number;
  total_slides: number;
  current_slide_number: number;
};
