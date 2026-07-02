"use client";

import { ExternalLink, MicOff } from "lucide-react";
import { useEffect, useState } from "react";

function isEmbeddedPreviewBrowser(): boolean {
  const ua = navigator.userAgent;
  return ua.includes("Electron") || ua.includes("Cursor");
}

export function MicPermissionBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isEmbeddedPreviewBrowser());
  }, []);

  if (!show) return null;

  return (
    <div className="absolute inset-x-4 top-[4.5rem] z-30 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-md">
      <div className="flex items-start gap-3">
        <MicOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950">
            Microphone not available in Cursor browser
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">
            Cursor&apos;s preview browser blocks mic permission prompts. To use
            voice, open this app in Chrome or Safari:
          </p>
          <a
            href="http://localhost:6670"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 underline underline-offset-2 hover:text-orange-700"
          >
            Open in external browser
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
