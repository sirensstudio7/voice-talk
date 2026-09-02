"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type DownloadState =
  | { status: "loading" }
  | { status: "ready"; url: string; expiresAt: string }
  | { status: "expired" }
  | { status: "error"; message: string };

export function PhotoDownloadClient({ token }: { token: string }) {
  const [state, setState] = useState<DownloadState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Invalid link" });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/public/photo/download/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (res.status === 410) {
          setState({ status: "expired" });
          return;
        }
        if (!res.ok) {
          const text = await res.text();
          setState({ status: "error", message: text || "Photo not found" });
          return;
        }
        const data = (await res.json()) as { url: string; expiresAt: string };
        setState({ status: "ready", url: data.url, expiresAt: data.expiresAt });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Unable to load photo. Please try again." });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-slate-50 to-orange-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
          LORESCALE
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Smart Photo Moment
        </h1>

        {state.status === "loading" ? (
          <p className="mt-6 text-sm text-slate-500">Preparing your photo…</p>
        ) : null}

        {state.status === "expired" ? (
          <div className="mt-6 space-y-2">
            <p className="text-lg font-medium text-slate-900">Link expired</p>
            <p className="text-sm text-slate-500">
              This download link is no longer valid. Ask the store staff if you need another photo.
            </p>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="mt-6 space-y-2">
            <p className="text-lg font-medium text-slate-900">Unable to open photo</p>
            <p className="text-sm text-slate-500">{state.message}</p>
          </div>
        ) : null}

        {state.status === "ready" ? (
          <div className="mt-6 space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.url}
              alt="Your souvenir photo"
              className="w-full rounded-2xl border border-slate-100 object-contain"
            />
            <a
              href={state.url}
              download="lorescale-photo.jpg"
              className="flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white"
            >
              Download photo
            </a>
            <p className="text-center text-xs text-slate-400">
              Link expires {new Date(state.expiresAt).toLocaleString()}
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
