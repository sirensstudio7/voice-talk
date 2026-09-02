"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

import { LorescaleLogo } from "@/components/landing/lorescale-logo";
import { cn } from '@voicetalk/ui';

export const DEMO_STEPS = [
  { id: 1, label: "Company" },
  { id: 2, label: "Location" },
  { id: 3, label: "Contact" },
  { id: 4, label: "Industry" },
  { id: 5, label: "Scale" },
  { id: 6, label: "Schedule" },
] as const;

type StepStatus = "completed" | "active" | "upcoming";

function getStepStatus(stepId: number, activeStep: number): StepStatus {
  if (stepId < activeStep) return "completed";
  if (stepId === activeStep) return "active";
  return "upcoming";
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

function DemoStepSidebar({ activeStep }: { activeStep: number }) {
  return (
    <aside className="hidden h-full w-[240px] shrink-0 flex-col border-r border-slate-200 bg-white px-6 py-8 md:flex">
      <p className="mb-6 text-xs font-medium uppercase tracking-wide text-slate-400">
        Request a demo
      </p>
      <nav className="space-y-4">
        {DEMO_STEPS.map((step) => {
          const status = getStepStatus(step.id, activeStep);
          return (
            <div key={step.id} className="flex items-center gap-3">
              <StepIndicator status={status} stepNumber={step.id} />
              <span
                className={cn(
                  "text-sm font-medium",
                  status === "active"
                    ? "text-orange-600"
                    : status === "completed"
                      ? "text-slate-700"
                      : "text-slate-400",
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function MobileStepDots({ activeStep }: { activeStep: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2 md:hidden">
      {DEMO_STEPS.map((step) => {
        const status = getStepStatus(step.id, activeStep);
        return (
          <div
            key={step.id}
            className={cn(
              "h-2 rounded-full transition-all",
              status === "active"
                ? "w-6 bg-orange-500"
                : status === "completed"
                  ? "w-2 bg-emerald-500"
                  : "w-2 bg-slate-200",
            )}
          />
        );
      })}
    </div>
  );
}

export function DemoRequestLayout({
  activeStep,
  title,
  subtitle,
  children,
  footer,
  contentClassName,
}: {
  activeStep: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="relative flex h-dvh flex-col bg-white" data-lenis-prevent>
      <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-5 md:px-10">
        <Link href="/" className="flex items-center gap-3">
          <LorescaleLogo className="h-8 w-auto" />
          <span className="text-lg font-semibold tracking-tight text-slate-900">Lorescale</span>
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          Back to home
        </Link>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1">
        <DemoStepSidebar activeStep={activeStep} />

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-8 md:px-10">
          <MobileStepDots activeStep={activeStep} />
          <div className={cn("mx-auto w-full max-w-[520px]", contentClassName)}>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
            </div>
            {children}
          </div>
        </main>
      </div>

      {footer ? (
        <footer className="relative z-20 shrink-0 bg-white">
          <div className="flex">
            <div
              className="hidden w-[240px] shrink-0 border-r border-slate-200 md:block"
              aria-hidden
            />
            <div className="flex flex-1 items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 md:px-10">
              {footer}
            </div>
          </div>
        </footer>
      ) : null}
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
      className={cn(
        "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition",
        selected
          ? "border-orange-400 bg-orange-50/50 ring-1 ring-orange-200"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
          selected ? "border-orange-500 bg-orange-500" : "border-slate-300 bg-white",
        )}
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

export function DemoContinueButton({
  children,
  disabled,
  loading,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
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
          <ArrowRightIcon className="h-4 w-4" />
        </>
      )}
    </button>
  );
}

export function DemoBackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
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

export function DemoActions({
  back,
  children,
}: {
  back?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="min-w-[4rem]">{back ?? <span />}</div>
      <div>{children}</div>
    </div>
  );
}
