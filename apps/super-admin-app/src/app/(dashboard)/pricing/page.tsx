"use client";

import { useCallback, useEffect, useState, type InputHTMLAttributes } from "react";

import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

function formatIdr(amount: number) {
  return `Rp${Number.isFinite(amount) ? amount.toLocaleString("id-ID") : "0"}`;
}

function yearlyFromMonthly(monthly: number, discountPercent: number) {
  const discount = Math.min(100, Math.max(0, discountPercent));
  return Math.round(monthly * 12 * (1 - discount / 100));
}

function parseNum(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type Pricing = Awaited<ReturnType<typeof api.getPricing>>;
type PlanDraft = {
  monthly: string;
  discount: string;
  minutes: string;
  workspaces: string;
  kiosks: string;
};
type AddonDraft = { monthly: string; d3: string; d6: string; d12: string };
type PackDraft = { price: string; minutes: string; discount: string };

function AffixField({
  prefix,
  suffix,
  disabled,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center rounded-lg border border-input bg-background text-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        disabled && "opacity-60",
        className,
      )}
    >
      {prefix ? (
        <span className="shrink-0 pl-2.5 text-xs font-medium text-muted-foreground">{prefix}</span>
      ) : null}
      <input
        {...props}
        disabled={disabled}
        className="h-full min-w-0 flex-1 bg-transparent px-2 tabular-nums outline-none disabled:cursor-not-allowed"
      />
      {suffix ? (
        <span className="shrink-0 pr-2.5 text-xs font-medium text-muted-foreground">{suffix}</span>
      ) : null}
    </div>
  );
}

export default function PricingPage() {
  const { token, admin } = useAuth();
  const canWrite = admin?.role === "super" || admin?.role === "finance";
  const [data, setData] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
  const [addonDrafts, setAddonDrafts] = useState<Record<string, AddonDraft>>({});
  const [packDrafts, setPackDrafts] = useState<Record<string, PackDraft>>({});

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const next = await api.getPricing(token);
      setData(next);
      setPlanDrafts(
        Object.fromEntries(
          next.plans.map((plan) => [
            plan.code,
            {
              monthly: String(plan.monthly_price_idr),
              discount: String(plan.yearly_discount_percent),
              minutes: String(plan.monthly_voice_minutes),
              workspaces: String(plan.workspace_limit),
              kiosks: String(plan.kiosk_display_limit),
            },
          ]),
        ),
      );
      setAddonDrafts(
        Object.fromEntries(
          next.addons.map((addon) => [
            addon.code,
            {
              monthly: String(addon.monthly_price_idr),
              d3: String(addon.discount_3m_percent),
              d6: String(addon.discount_6m_percent),
              d12: String(addon.discount_12m_percent),
            },
          ]),
        ),
      );
      setPackDrafts(
        Object.fromEntries(
          next.topup_packages.map((pkg) => [
            pkg.id,
            { price: String(pkg.price_idr), minutes: String(pkg.minutes), discount: String(pkg.discount_percent) },
          ]),
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePlan(code: string) {
    if (!token) return;
    const draft = planDrafts[code];
    if (!draft) return;
    setBusyKey(`plan:${code}`);
    setMessage(null);
    try {
      await api.updatePlanPricing(token, code, {
        monthly_price_idr: parseNum(draft.monthly),
        yearly_discount_percent: parseNum(draft.discount),
        monthly_voice_minutes: parseNum(draft.minutes),
        workspace_limit: parseNum(draft.workspaces),
        kiosk_display_limit: parseNum(draft.kiosks),
      });
      setMessage(`Saved ${code} plan.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveAddon(code: string) {
    if (!token) return;
    const draft = addonDrafts[code];
    if (!draft) return;
    setBusyKey(`addon:${code}`);
    setMessage(null);
    try {
      await api.updateAddonPricing(token, code, {
        monthly_price_idr: parseNum(draft.monthly),
        discount_3m_percent: parseNum(draft.d3),
        discount_6m_percent: parseNum(draft.d6),
        discount_12m_percent: parseNum(draft.d12),
      });
      setMessage(`Saved ${code} add-on.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save add-on");
    } finally {
      setBusyKey(null);
    }
  }

  async function savePack(id: string) {
    if (!token) return;
    const draft = packDrafts[id];
    if (!draft) return;
    setBusyKey(`pack:${id}`);
    setMessage(null);
    try {
      await api.updateTopupPackagePricing(token, id, {
        price_idr: parseNum(draft.price),
        minutes: parseNum(draft.minutes),
        discount_percent: parseNum(draft.discount),
      });
      setMessage("Saved minute pack.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pack");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Pricing"
        subtitle="Edit the catalog customers see. Pending and paid orders keep the amount they already submitted."
      />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {loading || !data ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Plans</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Yearly is monthly × 12 minus the discount. IDR only — USD cards stay on the fixed catalog.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Monthly</th>
                    <th className="px-3 py-3 font-medium">Yearly off</th>
                    <th className="px-3 py-3 font-medium">Yearly price</th>
                    <th className="px-3 py-3 font-medium">Minutes</th>
                    <th className="px-3 py-3 font-medium">Workspace</th>
                    <th className="px-3 py-3 font-medium">Kiosks</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.plans.map((plan) => {
                    const draft = planDrafts[plan.code] ?? {
                      monthly: "0",
                      discount: "0",
                      minutes: "0",
                      workspaces: "1",
                      kiosks: "1",
                    };
                    const yearly = yearlyFromMonthly(parseNum(draft.monthly), parseNum(draft.discount));
                    const dirty =
                      parseNum(draft.monthly) !== plan.monthly_price_idr ||
                      parseNum(draft.discount) !== plan.yearly_discount_percent ||
                      parseNum(draft.minutes) !== plan.monthly_voice_minutes ||
                      parseNum(draft.workspaces) !== plan.workspace_limit ||
                      parseNum(draft.kiosks) !== plan.kiosk_display_limit;
                    return (
                      <tr key={plan.code} className="border-t border-border">
                        <td className="px-5 py-3.5">
                          <StatusBadge
                            status={plan.is_trial ? "trial" : "paid"}
                            className="px-1.5 py-0 text-[10px] leading-4"
                          />
                          <p className="mt-1 font-medium">{plan.name}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            prefix="Rp"
                            type="number"
                            min={0}
                            step={1000}
                            value={draft.monthly}
                            disabled={!canWrite}
                            className="w-36"
                            onChange={(event) =>
                              setPlanDrafts((prev) => ({
                                ...prev,
                                [plan.code]: { ...draft, monthly: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            suffix="%"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={draft.discount}
                            disabled={!canWrite}
                            className="w-24"
                            onChange={(event) =>
                              setPlanDrafts((prev) => ({
                                ...prev,
                                [plan.code]: { ...draft, discount: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="font-medium tabular-nums">{formatIdr(yearly)}</p>
                          <p className="text-xs text-muted-foreground">
                            {parseNum(draft.discount) > 0
                              ? `Save ${draft.discount}% vs 12 months`
                              : "Same as 12 months"}
                          </p>
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            type="number"
                            min={0}
                            step={1}
                            value={draft.minutes}
                            disabled={!canWrite}
                            className="w-24"
                            onChange={(event) =>
                              setPlanDrafts((prev) => ({
                                ...prev,
                                [plan.code]: { ...draft, minutes: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            type="number"
                            min={1}
                            step={1}
                            value={draft.workspaces}
                            disabled={!canWrite}
                            className="w-20"
                            onChange={(event) =>
                              setPlanDrafts((prev) => ({
                                ...prev,
                                [plan.code]: { ...draft, workspaces: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            type="number"
                            min={1}
                            step={1}
                            value={draft.kiosks}
                            disabled={!canWrite}
                            className="w-20"
                            onChange={(event) =>
                              setPlanDrafts((prev) => ({
                                ...prev,
                                [plan.code]: { ...draft, kiosks: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            size="sm"
                            disabled={!canWrite || !dirty || busyKey === `plan:${plan.code}`}
                            onClick={() => void savePlan(plan.code)}
                          >
                            {busyKey === `plan:${plan.code}` ? "Saving…" : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Add-ons</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Monthly price plus checkout discounts for longer terms.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Add-on</th>
                    <th className="px-3 py-3 font-medium">Monthly</th>
                    <th className="px-3 py-3 font-medium">3 mo</th>
                    <th className="px-3 py-3 font-medium">6 mo</th>
                    <th className="px-3 py-3 font-medium">12 mo</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.addons.map((addon) => {
                    const draft = addonDrafts[addon.code] ?? {
                      monthly: "0",
                      d3: "5",
                      d6: "10",
                      d12: "15",
                    };
                    const dirty =
                      parseNum(draft.monthly) !== addon.monthly_price_idr ||
                      parseNum(draft.d3) !== addon.discount_3m_percent ||
                      parseNum(draft.d6) !== addon.discount_6m_percent ||
                      parseNum(draft.d12) !== addon.discount_12m_percent;
                    return (
                      <tr key={addon.code} className="border-t border-border">
                        <td className="px-5 py-3.5">
                          <p className="font-medium">{addon.name}</p>
                          <p className="text-xs text-muted-foreground">{formatIdr(parseNum(draft.monthly))}/mo</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            prefix="Rp"
                            type="number"
                            min={0}
                            step={1000}
                            value={draft.monthly}
                            disabled={!canWrite}
                            className="w-36"
                            onChange={(event) =>
                              setAddonDrafts((prev) => ({
                                ...prev,
                                [addon.code]: { ...draft, monthly: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            suffix="%"
                            type="number"
                            min={0}
                            max={100}
                            value={draft.d3}
                            disabled={!canWrite}
                            className="w-20"
                            onChange={(event) =>
                              setAddonDrafts((prev) => ({
                                ...prev,
                                [addon.code]: { ...draft, d3: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            suffix="%"
                            type="number"
                            min={0}
                            max={100}
                            value={draft.d6}
                            disabled={!canWrite}
                            className="w-20"
                            onChange={(event) =>
                              setAddonDrafts((prev) => ({
                                ...prev,
                                [addon.code]: { ...draft, d6: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            suffix="%"
                            type="number"
                            min={0}
                            max={100}
                            value={draft.d12}
                            disabled={!canWrite}
                            className="w-20"
                            onChange={(event) =>
                              setAddonDrafts((prev) => ({
                                ...prev,
                                [addon.code]: { ...draft, d12: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            size="sm"
                            disabled={!canWrite || !dirty || busyKey === `addon:${addon.code}`}
                            onClick={() => void saveAddon(addon.code)}
                          >
                            {busyKey === `addon:${addon.code}` ? "Saving…" : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Minute packs</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                List price minus discount is what customers pay on new orders.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Pack</th>
                    <th className="px-3 py-3 font-medium">Minutes</th>
                    <th className="px-3 py-3 font-medium">Price</th>
                    <th className="px-3 py-3 font-medium">Off</th>
                    <th className="px-3 py-3 font-medium">Sale price</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.topup_packages.map((pkg) => {
                    const draft = packDrafts[pkg.id] ?? { price: "0", minutes: "0", discount: "0" };
                    const sale = Math.round(
                      parseNum(draft.price) *
                        (1 - Math.min(100, Math.max(0, parseNum(draft.discount))) / 100),
                    );
                    const dirty =
                      parseNum(draft.price) !== pkg.price_idr ||
                      parseNum(draft.minutes) !== pkg.minutes ||
                      parseNum(draft.discount) !== pkg.discount_percent;
                    return (
                      <tr key={pkg.id} className="border-t border-border">
                        <td className="px-5 py-3.5">
                          <p className="font-medium">{pkg.name}</p>
                          <p className="text-xs text-muted-foreground">{pkg.code}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            type="number"
                            min={1}
                            step={1}
                            value={draft.minutes}
                            disabled={!canWrite}
                            className="w-24"
                            onChange={(event) =>
                              setPackDrafts((prev) => ({
                                ...prev,
                                [pkg.id]: { ...draft, minutes: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            prefix="Rp"
                            type="number"
                            min={0}
                            step={1000}
                            value={draft.price}
                            disabled={!canWrite}
                            className="w-36"
                            onChange={(event) =>
                              setPackDrafts((prev) => ({
                                ...prev,
                                [pkg.id]: { ...draft, price: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <AffixField
                            suffix="%"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={draft.discount}
                            disabled={!canWrite}
                            className="w-20"
                            onChange={(event) =>
                              setPackDrafts((prev) => ({
                                ...prev,
                                [pkg.id]: { ...draft, discount: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="font-medium tabular-nums">{formatIdr(sale)}</p>
                          <p className="text-xs text-muted-foreground">
                            {parseNum(draft.discount) > 0
                              ? `Save ${draft.discount}%`
                              : "No discount"}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            size="sm"
                            disabled={!canWrite || !dirty || busyKey === `pack:${pkg.id}`}
                            onClick={() => void savePack(pkg.id)}
                          >
                            {busyKey === `pack:${pkg.id}` ? "Saving…" : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
