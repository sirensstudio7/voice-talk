import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type AppointmentBooking = {
  id: string;
  product_id: string;
  treatment_name: string;
  customer_name: string;
  customer_phone: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

export async function fetchAvailability(
  businessSlug: string,
  productId: string,
  date: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    product_id: productId,
    date,
  });
  const response = await fetchWithTimeout(
    `${API_URL}/businesses/${encodeURIComponent(businessSlug)}/availability?${params.toString()}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? "Unable to load availability.");
  }
  const data = (await response.json()) as { slots: string[] };
  return data.slots ?? [];
}

export async function bookAppointment(
  businessSlug: string,
  body: {
    product_id: string;
    starts_at: string;
    customer_name: string;
    customer_phone?: string;
  },
): Promise<AppointmentBooking> {
  const response = await fetchWithTimeout(
    `${API_URL}/businesses/${encodeURIComponent(businessSlug)}/appointments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Unable to book appointment.");
  }
  return response.json() as Promise<AppointmentBooking>;
}
