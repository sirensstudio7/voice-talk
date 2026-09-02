const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type SmartPhotoMomentConfig = {
  active: boolean;
  enabled: boolean;
  voice_prompt: string;
  countdown_seconds: number;
};

export async function startPhotoSession(params: {
  slug: string;
  orderId?: string | null;
}): Promise<{ sessionId: string }> {
  const res = await fetch(`${API_URL}/public/photo/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: params.slug,
      orderId: params.orderId ?? undefined,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to start photo session");
  }
  return res.json() as Promise<{ sessionId: string }>;
}

export async function respondPhotoSession(
  sessionId: string,
  response: "yes" | "no" | "timeout",
): Promise<void> {
  await fetch(`${API_URL}/public/photo/session/${sessionId}/response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response }),
  });
}

export async function uploadPhotoSession(sessionId: string, blob: Blob): Promise<void> {
  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  const res = await fetch(`${API_URL}/public/photo/session/${sessionId}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Upload failed");
  }
}

export async function completePhotoSession(sessionId: string): Promise<{
  qrToken: string;
  downloadUrl: string;
  expiresAt: string;
}> {
  const res = await fetch(`${API_URL}/public/photo/session/${sessionId}/complete`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to complete photo session");
  }
  return res.json() as Promise<{
    qrToken: string;
    downloadUrl: string;
    expiresAt: string;
  }>;
}

export async function trackPhotoEvent(params: {
  slug: string;
  eventName: string;
  photoSessionId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await fetch(`${API_URL}/public/photo/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: params.slug,
      eventName: params.eventName,
      photoSessionId: params.photoSessionId,
      metadata: params.metadata,
    }),
  }).catch(() => undefined);
}
