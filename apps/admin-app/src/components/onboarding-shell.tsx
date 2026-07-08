"use client";

import {
  ArrowRightIcon,
  CheckCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth";

export const ONBOARDING_STEPS = [
  { id: 1, label: "Workspace" },
  { id: 2, label: "Business type" },
  { id: 3, label: "AI setup" },
  { id: 4, label: "Language" },
] as const;

type StepStatus = "completed" | "active" | "upcoming";

function getStepStatus(stepId: number, activeStep: number): StepStatus {
  if (stepId < activeStep) return "completed";
  if (stepId === activeStep) return "active";
  return "upcoming";
}

function UserAvatar() {
  const { user } = useAuth();
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600"
      title={user?.email}
    >
      {initials}
    </div>
  );
}

function StepIndicator({ status, stepNumber }: { status: StepStatus; stepNumber: number }) {
  if (status === "completed") {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <CheckCircleIcon className="h-4 w-4 text-white" />
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-400">
      {stepNumber}
    </div>
  );
}

export function OnboardingStepSidebar({ activeStep }: { activeStep: number }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[220px] shrink-0 pt-2 md:block">
        <p className="mb-6 text-xs font-medium uppercase tracking-wide text-slate-400">
          Account setup
        </p>
        <nav className="space-y-4">
          {ONBOARDING_STEPS.map((step) => {
            const status = getStepStatus(step.id, activeStep);
            return (
              <div key={step.id} className="flex items-center gap-3">
                <StepIndicator status={status} stepNumber={step.id} />
                <span
                  className={`text-sm font-medium ${
                    status === "active"
                      ? "text-orange-600"
                      : status === "completed"
                        ? "text-slate-700"
                        : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Mobile step dots */}
      <div className="mb-8 flex items-center justify-center gap-2 md:hidden">
        {ONBOARDING_STEPS.map((step) => {
          const status = getStepStatus(step.id, activeStep);
          return (
            <div
              key={step.id}
              className={`h-2 rounded-full transition-all ${
                status === "active"
                  ? "w-6 bg-orange-500"
                  : status === "completed"
                    ? "w-2 bg-emerald-500"
                    : "w-2 bg-slate-200"
              }`}
            />
          );
        })}
      </div>
    </>
  );
}

export function OnboardingLayout({
  activeStep,
  title,
  subtitle,
  children,
  footer,
}: {
  activeStep: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-white">
      {/* Aurora gradient */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 10% 30%, rgba(251,146,60,0.15) 0%, transparent 50%), radial-gradient(circle at 30% 70%, rgba(244,114,182,0.12) 0%, transparent 45%), radial-gradient(circle at 20% 50%, rgba(56,189,248,0.1) 0%, transparent 40%)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 shadow-md shadow-orange-500/20">
            <SparklesIcon className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900">Lorescale Admin</span>
        </div>
        <UserAvatar />
      </header>

      {/* Body */}
      <div className="relative z-10 flex flex-col px-6 pb-12 md:flex-row md:gap-16 md:px-10 md:pb-16">
        <OnboardingStepSidebar activeStep={activeStep} />

        <main className="flex flex-1 flex-col items-center justify-center">
          <div className="w-full max-w-[520px]">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
            </div>

            {children}

            {footer ? <div className="mt-8">{footer}</div> : null}
          </div>
        </main>
      </div>
    </div>
  );
}

export function SelectionCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition ${
        selected
          ? "border-orange-400 bg-orange-50/50 ring-1 ring-orange-200"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          selected ? "border-orange-500 bg-orange-500" : "border-slate-300 bg-white"
        }`}
      >
        {selected ? <div className="h-2 w-2 rounded-full bg-white" /> : null}
      </div>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
    </button>
  );
}

export function OnboardingContinueButton({
  children,
  disabled,
  loading,
  onClick,
  type = "button",
  showArrow = true,
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  showArrow?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {children}
        </>
      ) : (
        <>
          {children}
          {showArrow ? <ArrowRightIcon className="h-4 w-4" /> : null}
        </>
      )}
    </button>
  );
}

export function OnboardingBackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-sm font-medium text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
    >
      Back
    </button>
  );
}

export function OnboardingActions({
  back,
  children,
}: {
  back?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-4">
      <div className="min-w-[4rem]">{back ?? null}</div>
      <div className="ml-auto">{children}</div>
    </div>
  );
}
