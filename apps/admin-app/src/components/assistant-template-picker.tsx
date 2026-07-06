"use client";

import { Check, UserRound } from "lucide-react";

import { ASSISTANT_TEMPLATES } from "@/lib/assistant-templates";
import { useAssistantTemplate } from "@/lib/assistant-template-context";

export function AssistantTemplatePicker() {
  const { selectedTemplateId, setSelectedTemplateId } = useAssistantTemplate();

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-900">Start from a template</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Choose a preset to preview the avatar and personality, then apply it to your rules.
        </p>
      </div>
      <ul
        className="grid gap-2 sm:grid-cols-3"
        aria-label="Assistant templates"
      >
        {ASSISTANT_TEMPLATES.map((template) => {
          const active = template.id === selectedTemplateId;

          return (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
                aria-pressed={active}
                className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${
                  active
                    ? "border-orange-300 bg-orange-50 ring-2 ring-orange-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                    active
                      ? "border-orange-200 bg-orange-100 text-orange-600"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <UserRound className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {template.label}
                    </p>
                    {active ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden />
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{template.description}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
