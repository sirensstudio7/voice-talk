"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

import {
  OnboardingActions,
  OnboardingContinueButton,
  OnboardingLayout,
} from "@/components/onboarding-shell";
import { ApiRequestError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  isValidSlug,
  loadWorkspaceDraft,
  nameToSlug,
  saveWorkspaceDraft,
} from "@/lib/onboarding";

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

export function WorkspaceOnboardingClient() {
  const router = useRouter();
  const { token, business, refreshBusinesses, setBusinessId } = useAuth();
  const draft = loadWorkspaceDraft();

  const [name, setName] = useState(draft?.name ?? business?.name ?? "");
  const slug = nameToSlug(name);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const slugIsValid = isValidSlug(slug);

  useEffect(() => {
    saveWorkspaceDraft({ name });
  }, [name]);

  const checkSlug = useCallback(
    async (value: string) => {
      if (!token) return;

      if (!value) {
        setSlugStatus("idle");
        setSlugSuggestions([]);
        setSlugError(null);
        return;
      }

      if (!isValidSlug(value)) {
        setSlugStatus("invalid");
        setSlugSuggestions([]);
        setSlugError(null);
        return;
      }

      setSlugStatus("checking");
      setSlugError(null);
      try {
        if (business?.slug === value) {
          setSlugStatus("available");
          setSlugSuggestions([]);
          return;
        }

        const result = await api.checkSlug(token, value);
        if (result.available) {
          setSlugStatus("available");
          setSlugSuggestions([]);
        } else {
          setSlugStatus("taken");
          setSlugSuggestions(result.suggestions);
        }
      } catch (err) {
        setSlugSuggestions([]);
        if (err instanceof ApiRequestError && err.status === 400) {
          setSlugStatus("invalid");
          setSlugError(err.message);
          return;
        }
        setSlugStatus("error");
        if (err instanceof ApiRequestError) {
          setSlugError(err.message);
        } else if (err instanceof Error) {
          setSlugError(err.message);
        } else {
          setSlugError("Could not check URL availability. Try again.");
        }
      }
    },
    [token, business?.slug],
  );

  useEffect(() => {
    if (!token || !name.trim()) {
      setSlugStatus("idle");
      return;
    }

    if (!slugIsValid) {
      setSlugStatus("invalid");
      return;
    }

    if (business?.slug === slug) {
      setSlugStatus("available");
      setSlugSuggestions([]);
      setSlugError(null);
      return;
    }

    setSlugStatus("checking");

    const timer = window.setTimeout(() => {
      void checkSlug(slug);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [slug, slugIsValid, token, checkSlug, name, business?.slug]);

  const canContinue =
    name.trim().length > 0 &&
    slugIsValid &&
    slugStatus === "available" &&
    !loading &&
    !success;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    if (business && business.slug === slug) {
      router.push("/onboarding/business");
      return;
    }

    if (!canContinue) return;

    setLoading(true);
    setError(null);
    try {
      const business = await api.createBusiness(token, {
        name: name.trim(),
        slug,
      });
      await refreshBusinesses();
      setBusinessId(business.id);
      setSuccess(true);
      window.setTimeout(() => {
        router.push("/onboarding/business");
      }, 500);
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : "Could not create workspace. Try again.";
      setError(message);
      if (
        err instanceof ApiRequestError &&
        err.status === 400 &&
        /slug already exists/i.test(message)
      ) {
        setSlugStatus("taken");
      } else {
        void checkSlug(slug);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingLayout
      activeStep={1}
      title="Let's create your workspace"
      subtitle="This is where your AI Employees, team members, and settings live."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="workspace-name" className="mb-1.5 block text-sm font-medium text-slate-700">
            Workspace name
          </label>
          <input
            id="workspace-name"
            autoFocus
            required
            maxLength={100}
            placeholder="Coffee Haven"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {name.trim() ? (
            <p className="mt-2 text-sm text-slate-500">
              Workspace URL:{" "}
              <span className="font-medium text-slate-700">lore.app/{slug || "…"}</span>
            </p>
          ) : null}
          <div className="mt-2 min-h-[20px] text-xs">
            {slugStatus === "checking" ? (
              <span className="text-slate-400">Checking availability…</span>
            ) : slugStatus === "available" ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircleIcon className="h-4 w-4" />
                Available
              </span>
            ) : slugStatus === "taken" ? (
              <div className="space-y-2">
                <span className="text-red-600">
                  This URL is already taken — try a different workspace name
                </span>
                {slugSuggestions.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500">Try:</span>
                    {slugSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setName(suggestion)}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-orange-300 hover:bg-orange-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : slugStatus === "error" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-red-600">
                  {slugError ?? "Could not check URL availability."}
                </span>
                <button
                  type="button"
                  onClick={() => void checkSlug(slug)}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700"
                >
                  Retry
                </button>
              </div>
            ) : slugStatus === "invalid" && name.trim() ? (
              <span className="text-red-600">Workspace name needs at least one letter or number</span>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <OnboardingActions>
          <OnboardingContinueButton
            type="submit"
            disabled={business?.slug === slug ? false : !canContinue}
            loading={loading}
            showArrow={!success}
          >
            {success ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4" />
                Workspace created
              </span>
            ) : loading ? (
              "Creating workspace…"
            ) : (
              "Continue"
            )}
          </OnboardingContinueButton>
        </OnboardingActions>
      </form>
    </OnboardingLayout>
  );
}
