"use client";

import dynamic from "next/dynamic";

import { AssistantTemplatePicker } from "@/components/assistant-template-picker";
import { useAssistantTemplate } from "@/lib/assistant-template-context";

const AvatarHero = dynamic(
  () => import("@voicetalk/avatar").then((mod) => ({ default: mod.AvatarHero })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[360px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
          <p className="text-sm font-medium text-slate-500">Loading preview…</p>
        </div>
      </div>
    ),
  },
);

export function AssistantPreviewHero() {
  const { selectedTemplate } = useAssistantTemplate();

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <AssistantTemplatePicker />
      <div className="relative h-[420px] w-full">
        <AvatarHero
          key={selectedTemplate.id}
          isTalking={false}
          modelPath={selectedTemplate.modelPath}
          assistantName={selectedTemplate.assistant_name}
          frameClassName="absolute inset-x-0 bottom-0 top-0 mx-auto aspect-[2/3] h-full max-h-[420px] w-auto [mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)]"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-100 to-transparent"
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 px-6 pb-5">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Live preview
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              {selectedTemplate.assistant_name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{selectedTemplate.description}</p>
          </div>
          <p className="hidden rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 sm:inline">
            Same 3D model · personality varies
          </p>
        </div>
      </div>
    </section>
  );
}
