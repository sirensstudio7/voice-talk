"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpTrayIcon,
  CameraIcon,
  ChatBubbleOvalLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  CommandLineIcon,
  GlobeAltIcon,
  LightBulbIcon,
  PhotoIcon,
  SparklesIcon,
  TrashIcon,
  UserCircleIcon,
  WrenchIcon,
} from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { AssistantPreviewHero } from "@/components/assistant-preview-hero";
import { api, type AiLanguage, type AiRules, type AiTone } from "@/lib/api";
import { useAssistantTemplate } from "@/lib/assistant-template-context";
import { templateToAiRules } from "@/lib/assistant-templates";
import { useAuth } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEFAULT_ASSISTANT_AVATAR = "/lorescale-cashier-nobg.png";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

type RuleField = "personality" | "behavioral_rules" | "tool_instructions";

const LANGUAGE_OPTIONS: { value: AiLanguage; label: string; description: string }[] = [
  {
    value: "id",
    label: "Bahasa Indonesia",
    description: "Your assistant speaks Indonesian with customers by default.",
  },
  {
    value: "en",
    label: "English",
    description: "Your assistant speaks English with customers by default.",
  },
];

const IDLE_TIMEOUT_OPTIONS: { value: string; label: string; description: string }[] = [
  {
    value: "0",
    label: "Disabled",
    description: "Conversations only end when the AI or patient ends them manually.",
  },
  {
    value: "15",
    label: "15 seconds",
    description: "End the conversation after 15 seconds of silence.",
  },
  {
    value: "30",
    label: "30 seconds",
    description: "End the conversation after 30 seconds of silence.",
  },
  {
    value: "60",
    label: "60 seconds",
    description: "End the conversation after 60 seconds of silence.",
  },
  {
    value: "90",
    label: "90 seconds",
    description: "End the conversation after 90 seconds of silence.",
  },
  {
    value: "120",
    label: "2 minutes",
    description: "End the conversation after 2 minutes of silence.",
  },
];

const TONE_OPTIONS: { value: AiTone; label: string; description: string }[] = [
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm and welcoming — the default assistant experience.",
  },
  {
    value: "professional",
    label: "Professional",
    description: "Formal and concise — suited for business settings.",
  },
  {
    value: "casual",
    label: "Casual",
    description: "Relaxed and conversational — like a barista friend.",
  },
];

const SECTIONS: {
  key: RuleField;
  label: string;
  description: string;
  placeholder: string;
  icon: typeof SparklesIcon;
  minHeight: string;
}[] = [
  {
    key: "personality",
    label: "Personality",
    description: "Your assistant's voice, tone, and character when talking to customers.",
    placeholder:
      "You are a friendly AI cashier. Be warm, concise, and helpful. Confirm orders clearly before completing them.",
    icon: SparklesIcon,
    minHeight: "min-h-36",
  },
  {
    key: "behavioral_rules",
    label: "Behavior rules",
    description: "Guidelines for how your assistant should handle specific situations.",
    placeholder:
      "Always greet customers warmly. Offer upsells politely when relevant. If unsure, ask a clarifying question instead of guessing.",
    icon: ClipboardDocumentCheckIcon,
    minHeight: "min-h-28",
  },
  {
    key: "tool_instructions",
    label: "Tool instructions",
    description: "How your assistant should use ordering tools like add_to_order and confirm_order.",
    placeholder:
      "Call add_to_order as soon as the customer picks an item. After confirm_order, ask loyalty or other checkout questions first (one topic per turn), then ask for their name last in a separate turn before payment. The name question must be the only question in that turn.",
    icon: WrenchIcon,
    minHeight: "min-h-28",
  },
];

function rulesEqual(a: AiRules, b: AiRules) {
  return (
    a.assistant_name === b.assistant_name &&
    a.personality === b.personality &&
    a.tone === b.tone &&
    a.language === b.language &&
    a.behavioral_rules === b.behavioral_rules &&
    a.tool_instructions === b.tool_instructions &&
    a.idle_timeout_seconds === b.idle_timeout_seconds
  );
}

function SettingsSelect<T extends string>({
  id,
  label,
  description,
  icon: Icon,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  icon: typeof GlobeAltIcon;
  value: T;
  options: { value: T; label: string; description: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p id={`${id}-label`} className="text-sm font-semibold text-slate-900">
            {label}
          </p>
          <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <button
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label`}
          onClick={() => setOpen((current) => !current)}
          className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition-all ${
            open
              ? "border-orange-300 ring-2 ring-orange-500/20"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80"
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {selected?.label ?? "Select…"}
            </p>
            {selected ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">{selected.description}</p>
            ) : null}
          </div>
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open ? (
          <ul
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 ring-1 ring-slate-200/80"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-orange-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold ${isSelected ? "text-orange-700" : "text-slate-900"}`}
                      >
                        {option.label}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                        {option.description}
                      </p>
                    </div>
                    {isSelected ? (
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden />
                    ) : (
                      <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function AssistantNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <UserCircleIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="assistant-name" className="text-sm font-semibold text-slate-900">
            Assistant name
          </label>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            The name customers see and the AI uses when introducing itself.
          </p>
        </div>
      </div>
      <input
        id="assistant-name"
        type="text"
        maxLength={50}
        className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-900 outline-none transition-colors focus-visible:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-500/20"
        placeholder="Lorescale"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}

function AvatarPreviewImage({
  src,
  size,
  alt = "",
  className = "",
}: {
  src: string;
  size: number;
  alt?: string;
  className?: string;
}) {
  const useNativeImage =
    src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:");

  if (useNativeImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={src}
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={className}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={className}
    />
  );
}

function AssistantAvatarField({
  avatarUrl,
  assistantName,
  localPreview,
  cacheBust,
  uploading,
  onUpload,
  onRemove,
}: {
  avatarUrl: string;
  assistantName: string;
  localPreview: string | null;
  cacheBust: number;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedAvatarUrl = avatarUrl ? resolveMediaUrl(avatarUrl) : "";
  const previewSrc =
    localPreview ??
    (resolvedAvatarUrl
      ? `${resolvedAvatarUrl}${resolvedAvatarUrl.includes("?") ? "&" : "?"}v=${cacheBust || 0}`
      : DEFAULT_ASSISTANT_AVATAR);
  const hasCustomAvatar = Boolean(avatarUrl);

  const openFilePicker = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <PhotoIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Assistant avatar</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Appears in the voice page header and next to assistant messages. A square portrait with
            a plain or transparent background works best.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <button
          type="button"
          disabled={uploading}
          onClick={openFilePicker}
          className="group relative mx-auto flex h-36 w-36 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition-colors hover:border-orange-300 hover:bg-orange-50/40 disabled:cursor-not-allowed disabled:opacity-60 lg:mx-0"
          aria-label={hasCustomAvatar ? "Replace assistant avatar" : "Upload assistant avatar"}
        >
          <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-white bg-slate-100 shadow-md ring-1 ring-slate-200">
            <AvatarPreviewImage
              src={previewSrc}
              size={112}
              alt="Assistant avatar preview"
              className="h-full w-full object-cover object-center"
            />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-900/0 opacity-0 transition-all group-hover:bg-slate-900/40 group-hover:opacity-100 group-disabled:opacity-0">
            <CameraIcon className="h-5 w-5 text-white drop-shadow" />
            <span className="text-xs font-semibold text-white drop-shadow">
              {uploading ? "Uploading…" : hasCustomAvatar ? "Replace" : "Upload"}
            </span>
          </div>
        </button>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Customer preview
            </p>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">Voice page header</p>
                <div className="flex justify-center rounded-lg bg-gradient-to-b from-slate-200/60 to-slate-100/40 px-4 py-3">
                  <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06)]">
                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-100">
                      <AvatarPreviewImage
                        src={previewSrc}
                        size={32}
                        alt=""
                        className="h-full w-full object-cover object-center"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-white bg-emerald-500" />
                    </div>
                    <p className="flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold leading-none text-slate-900">
                      {assistantName}
                      <span className="font-normal text-slate-400">·</span>
                      <span className="font-normal text-slate-500">Live</span>
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">Conversation bubble</p>
                <div className="flex items-end gap-2 px-1">
                  <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    <AvatarPreviewImage
                      src={previewSrc}
                      size={28}
                      alt=""
                      className="h-full w-full object-cover object-center"
                    />
                  </div>
                  <div className="max-w-[85%] rounded-2xl bg-slate-100 px-3.5 py-2 text-sm leading-relaxed text-slate-700">
                    Hello! How can I help you today?
                  </div>
                </div>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={openFilePicker}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {uploading ? "Uploading…" : hasCustomAvatar ? "Replace avatar" : "Upload avatar"}
            </button>
            {hasCustomAvatar ? (
              <button
                type="button"
                disabled={uploading}
                onClick={onRemove}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <TrashIcon className="h-4 w-4" />
                Remove
              </button>
            ) : null}
          </div>

          <p className="text-xs text-slate-400">
            PNG, JPG, WEBP, or GIF · square portrait recommended
          </p>
        </div>
      </div>
    </section>
  );
}

function LanguageSelector({
  value,
  onChange,
}: {
  value: AiLanguage;
  onChange: (language: AiLanguage) => void;
}) {
  return (
    <SettingsSelect
      id="ai-language"
      label="Language"
      description={"Default language your assistant uses when talking to customers.\nCustomers can still switch languages in the app."}
      icon={GlobeAltIcon}
      value={value}
      options={LANGUAGE_OPTIONS}
      onChange={onChange}
    />
  );
}

function ToneSelector({
  value,
  onChange,
}: {
  value: AiTone;
  onChange: (tone: AiTone) => void;
}) {
  return (
    <SettingsSelect
      id="ai-tone"
      label="Tone"
      description="Sets how your assistant phrases responses. Applies on the next customer session."
      icon={ChatBubbleOvalLeftIcon}
      value={value}
      options={TONE_OPTIONS}
      onChange={onChange}
    />
  );
}

function IdleTimeoutSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (seconds: number) => void;
}) {
  const selectedValue = String(value ?? 30);

  return (
    <SettingsSelect
      id="ai-idle-timeout"
      label="Silence timeout"
      description="How long to wait after the assistant finishes speaking before ending the conversation. Applies to FAQ-only sessions."
      icon={ClockIcon}
      value={selectedValue}
      options={IDLE_TIMEOUT_OPTIONS}
      onChange={(next) => onChange(Number(next))}
    />
  );
}

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      disabled={disabled ?? !text}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {copied ? (
        <>
          <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
          Copied
        </>
      ) : (
        <>
          <ClipboardDocumentIcon className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

function RuleSection({
  label,
  description,
  placeholder,
  icon: Icon,
  minHeight,
  value,
  onChange,
}: {
  label: string;
  description: string;
  placeholder: string;
  icon: typeof SparklesIcon;
  minHeight: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldId = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={fieldId} className="text-sm font-semibold text-slate-900">
              {label}
            </label>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
          </div>
        </div>
        <CopyButton text={value} />
      </div>

      <textarea
        id={fieldId}
        className={`${minHeight} w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-relaxed text-slate-900 outline-none transition-colors focus-visible:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-500/20`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />

      <p className="mt-2 text-right text-xs text-slate-400">
        {value.length.toLocaleString()} {value.length === 1 ? "character" : "characters"}
      </p>
    </section>
  );
}

function PreviewPanel({ preview }: { preview: string }) {
  const lineCount = preview ? preview.split("\n").length : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-slate-100">
            <CommandLineIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Prompt preview</p>
            <p className="text-xs text-slate-500">
              {lineCount > 0 ? `${lineCount} lines · saved state` : "No preview yet"}
            </p>
          </div>
        </div>

        <CopyButton text={preview} />
      </div>

      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <p className="text-xs leading-relaxed text-slate-500">
          This is the full system instruction your assistant receives — your rules combined with menu items
          and knowledge entries. Save changes to refresh the preview.
        </p>
      </div>

      {preview ? (
        <pre className="max-h-[min(720px,calc(100vh-var(--header-height)-12rem))] flex-1 overflow-auto bg-slate-950 p-4 text-xs leading-relaxed whitespace-pre-wrap text-slate-100">
          {preview}
        </pre>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <LightBulbIcon className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-700">Preview will appear here</p>
          <p className="mt-1 max-w-xs text-xs text-slate-500">
            Save your rules to generate the full prompt your assistant uses in conversation.
          </p>
        </div>
      )}
    </div>
  );
}

export function AiRulesPageClient() {
  const { token, business } = useAuth();
  const { state: sidebarState, isMobile } = useSidebar();
  const { selectedTemplate } = useAssistantTemplate();
  const [rules, setRules] = useState<AiRules | null>(null);
  const [savedRules, setSavedRules] = useState<AiRules | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(null);
  const [avatarCacheBust, setAvatarCacheBust] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token || !business) return;
    setLoading(true);
    setError(null);
    try {
      const [rulesData, previewData] = await Promise.all([
        api.getAiRules(token, business.id),
        api.getPromptPreview(token, business.id),
      ]);
      setRules(rulesData);
      setSavedRules(rulesData);
      setAvatarCacheBust(rulesData.avatar_url ? Date.now() : 0);
      setPreview(previewData.system_instruction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token, business]);

  const isDirty = useMemo(
    () => rules !== null && savedRules !== null && !rulesEqual(rules, savedRules),
    [rules, savedRules],
  );

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  const updateField = (field: RuleField, value: string) => {
    if (!rules) return;
    setRules({ ...rules, [field]: value });
    setMessage(null);
  };

  const updateAssistantName = (assistant_name: string) => {
    if (!rules) return;
    setRules({ ...rules, assistant_name });
    setMessage(null);
  };

  const updateTone = (tone: AiTone) => {
    if (!rules) return;
    setRules({ ...rules, tone });
    setMessage(null);
  };

  const updateLanguage = (language: AiLanguage) => {
    if (!rules) return;
    setRules({ ...rules, language });
    setMessage(null);
  };

  const updateIdleTimeout = (idle_timeout_seconds: number) => {
    if (!rules) return;
    setRules({ ...rules, idle_timeout_seconds });
    setMessage(null);
  };

  const faqOnlyMode =
    business?.capabilities != null &&
    !business.capabilities.ordering_enabled &&
    !business.capabilities.booking_enabled;

  const save = async () => {
    if (!token || !business || !rules) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateAiRules(token, business.id, rules);
      const previewData = await api.getPromptPreview(token, business.id);
      setSavedRules(rules);
      setPreview(previewData.system_instruction);
      setMessage(`AI rules saved. ${rules.assistant_name || "Your assistant"} will use the updated prompt.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save AI rules.");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!savedRules) return;
    setRules(savedRules);
    setMessage(null);
    setError(null);
  };

  const applySelectedTemplate = () => {
    if (!rules) return;
    setRules(templateToAiRules(selectedTemplate, rules));
    setMessage(null);
    setError(null);
  };

  const uploadAvatar = async (file: File) => {
    if (!token || !business) return;

    const objectUrl = URL.createObjectURL(file);
    setLocalAvatarPreview(objectUrl);
    setUploadingAvatar(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await api.uploadAssistantAvatar(token, business.id, file);
      setRules((current) => (current ? { ...current, avatar_url: updated.avatar_url } : current));
      setSavedRules((current) =>
        current ? { ...current, avatar_url: updated.avatar_url } : current,
      );
      setAvatarCacheBust(Date.now());
      setMessage("Assistant avatar uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Avatar upload failed.");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setLocalAvatarPreview(null);
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    if (!token || !business) return;

    setUploadingAvatar(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await api.deleteAssistantAvatar(token, business.id);
      setRules((current) => (current ? { ...current, avatar_url: updated.avatar_url } : current));
      setSavedRules((current) =>
        current ? { ...current, avatar_url: updated.avatar_url } : current,
      );
      setMessage("Assistant avatar removed. Customers will see the default avatar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="AI Rules" subtitle="Loading assistant configuration…" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-4">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
              />
            ))}
          </div>
          <div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        </div>
      </>
    );
  }

  if (!rules) {
    return (
      <>
        <PageHeader title="AI Rules" subtitle="Control your assistant's personality and behavior." />
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Unable to load AI rules for this business."}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-24">
        <PageHeader
          title="AI Rules"
          subtitle={
            isDirty
              ? "You have unsaved changes — save to update the assistant prompt."
              : "Control your assistant's personality, behavior, and tool usage."
          }
        />

      {message ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-600/10">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-600/10">
          {error}
        </p>
      ) : null}

      <AssistantPreviewHero />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-4">
          <AssistantNameField
            value={rules.assistant_name ?? "Lorescale"}
            onChange={updateAssistantName}
          />
          <AssistantAvatarField
            avatarUrl={rules.avatar_url ?? ""}
            assistantName={rules.assistant_name ?? "Lorescale"}
            localPreview={localAvatarPreview}
            cacheBust={avatarCacheBust}
            uploading={uploadingAvatar}
            onUpload={(file) => {
              void uploadAvatar(file);
            }}
            onRemove={() => {
              void removeAvatar();
            }}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <LanguageSelector value={rules.language ?? "id"} onChange={updateLanguage} />
            <ToneSelector value={rules.tone} onChange={updateTone} />
          </div>
          {faqOnlyMode ? (
            <IdleTimeoutSelector
              value={rules.idle_timeout_seconds ?? 30}
              onChange={updateIdleTimeout}
            />
          ) : null}
          {SECTIONS.map((section) => (
            <RuleSection
              key={section.key}
              label={section.label}
              description={section.description}
              placeholder={section.placeholder}
              icon={section.icon}
              minHeight={section.minHeight}
              value={rules[section.key]}
              onChange={(value) => updateField(section.key, value)}
            />
          ))}
        </div>

        <aside className="xl:sticky xl:top-[calc(var(--header-height)+2rem)] xl:self-start">
          <PreviewPanel preview={preview} />
        </aside>
      </div>
      </div>

      <footer
        style={footerStyle}
        className="fixed bottom-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Button type="button" variant="outline" disabled={saving || !isDirty} onClick={discard}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={applySelectedTemplate}
            >
              <SparklesIcon />
              Apply template
            </Button>
            <Button type="button" disabled={saving || !isDirty} onClick={() => void save()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </footer>
    </>
  );
}
