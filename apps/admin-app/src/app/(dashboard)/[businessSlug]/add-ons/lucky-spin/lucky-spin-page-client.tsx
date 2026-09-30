"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  GiftIcon,
  PlusIcon,
  SparklesIcon,
  TrophyIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AddonConfigPending } from "@/components/addon-config-pending";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import {
  api,
  type LuckySpinAnalytics,
  type LuckySpinCampaign,
  type LuckySpinPrize,
  type LuckySpinWinner,
} from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { cn } from "@/lib/cn";
import { deferEffectRun } from "@/lib/defer-effect-run";
import { useAddonStatus } from "@/lib/use-addon-status";

const FEATURES = [
  {
    icon: TrophyIcon,
    title: "Branded spin campaigns",
    body: "Create time-boxed campaigns with daily and total spin limits for each workspace.",
  },
  {
    icon: GiftIcon,
    title: "Custom prizes & probabilities",
    body: "Upload prize images and quantity. Odds auto-balance from stock, or switch a campaign to manual percentages.",
  },
  {
    icon: SparklesIcon,
    title: "Vouchers & redemption",
    body: "Winners get unique voucher codes staff can search and mark redeemed in the dashboard.",
  },
] as const;

const SCREENSHOTS = [
  {
    id: "s1",
    src: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s2",
    src: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s3",
    src: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s4",
    src: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s5",
    src: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80",
  },
] as const;

type ManageTab = "display" | "campaigns" | "prizes" | "winners" | "analytics";

export function LuckySpinPageClient() {
  const { token, business, status, loading, error, setError, isActive, isPending } =
    useAddonStatus("lucky_spin");
  const { state: sidebarState, isMobile } = useSidebar();
  const [enabled, setEnabled] = useState(false);
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true);
  const [settingsReady, setSettingsReady] = useState(false);
  const [campaigns, setCampaigns] = useState<LuckySpinCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [prizes, setPrizes] = useState<LuckySpinPrize[]>([]);
  const [probabilityTotal, setProbabilityTotal] = useState(0);
  const [winners, setWinners] = useState<LuckySpinWinner[]>([]);
  const [winnersTotal, setWinnersTotal] = useState(0);
  const [analytics, setAnalytics] = useState<LuckySpinAnalytics | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manageTab, setManageTab] = useState<ManageTab>("display");

  const [campaignName, setCampaignName] = useState("");
  const [voucherSearch, setVoucherSearch] = useState("");
  const [redeemCode, setRedeemCode] = useState("");

  const [prizeModalOpen, setPrizeModalOpen] = useState(false);
  const [prizeItemName, setPrizeItemName] = useState("");
  const [prizeQuantity, setPrizeQuantity] = useState("");
  const [prizeProbability, setPrizeProbability] = useState("");
  const [prizeImage, setPrizeImage] = useState<File | null>(null);
  const [prizeImagePreview, setPrizeImagePreview] = useState<string | null>(null);
  const [prizeModalError, setPrizeModalError] = useState<string | null>(null);
  const [savingPrize, setSavingPrize] = useState(false);
  const prizeImagePreviewRef = useRef<string | null>(null);
  const savingPrizeRef = useRef(false);

  useEffect(() => {
    savingPrizeRef.current = savingPrize;
  }, [savingPrize]);

  useEffect(() => {
    return () => {
      if (prizeImagePreviewRef.current) {
        URL.revokeObjectURL(prizeImagePreviewRef.current);
        prizeImagePreviewRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!prizeModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingPrizeRef.current) {
        setPrizeModalOpen(false);
        if (prizeImagePreviewRef.current) {
          URL.revokeObjectURL(prizeImagePreviewRef.current);
          prizeImagePreviewRef.current = null;
        }
        setPrizeItemName("");
        setPrizeQuantity("");
        setPrizeProbability("");
        setPrizeImage(null);
        setPrizeImagePreview(null);
        setPrizeModalError(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [prizeModalOpen]);

  const slug = business?.slug ?? "";
  const selectedCampaign =
    campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const oddsMode = selectedCampaign?.odds_mode === "manual" ? "manual" : "auto";

  useEffect(() => {
    if (!token || !business?.id || !isActive) {
      deferEffectRun(() => setSettingsReady(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [settings, campaignRes, stats] = await Promise.all([
          api.getLuckySpinSettings(token, business.id),
          api.listLuckySpinCampaigns(token, business.id),
          api.getLuckySpinAnalytics(token, business.id),
        ]);
        if (cancelled) return;
        setEnabled(settings.enabled);
        setAiVoiceEnabled(settings.ai_voice_enabled !== false);
        setCampaigns(campaignRes.items);
        setAnalytics(stats);
        setSelectedCampaignId((current) => current || campaignRes.items[0]?.id || "");
        setSettingsReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Lucky Spin");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, business?.id, isActive, setError]);

  const loadPrizes = useCallback(async () => {
    if (!token || !business?.id || !selectedCampaignId || !isActive) return;
    try {
      const res = await api.listLuckySpinPrizes(token, business.id, selectedCampaignId);
      setPrizes(res.items);
      setProbabilityTotal(res.probability_total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prizes");
    }
  }, [token, business, selectedCampaignId, isActive, setError]);

  useEffect(() => {
    if (isActive && (manageTab === "prizes" || manageTab === "campaigns")) {
      deferEffectRun(loadPrizes);
    }
  }, [isActive, manageTab, loadPrizes]);

  useEffect(() => {
    if (!token || !business?.id || !isActive || manageTab !== "winners") return;
    void api
      .listLuckySpinWinners(token, business.id, voucherSearch || undefined)
      .then((res) => {
        setWinners(res.items);
        setWinnersTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load winners"));
  }, [token, business?.id, isActive, manageTab, voucherSearch, setError]);

  async function toggleEnabled(next: boolean) {
    if (!token || !business?.id) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.updateLuckySpinSettings(token, business.id, { enabled: next });
      setEnabled(res.enabled);
      setAiVoiceEnabled(res.ai_voice_enabled !== false);
      setMessage(
        next
          ? "Lucky Spin enabled on the customer screen. Avatar moves to bottom-right."
          : "Lucky Spin hidden. Customer screen restored.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update display setting");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAiVoice(next: boolean) {
    if (!token || !business?.id) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.updateLuckySpinSettings(token, business.id, {
        ai_voice_enabled: next,
      });
      setAiVoiceEnabled(res.ai_voice_enabled !== false);
      setEnabled(res.enabled);
      setMessage(
        next
          ? "AI will congratulate winners after a spin."
          : "AI voice congrats off — use a live MC if needed.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update AI voice setting");
    } finally {
      setBusy(false);
    }
  }

  async function createCampaign() {
    if (!token || !business?.id || !campaignName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createLuckySpinCampaign(token, business.id, {
        name: campaignName.trim(),
        status: "draft",
        one_per_user: true,
      });
      setCampaignName("");
      setCampaigns((prev) => [created, ...prev]);
      setSelectedCampaignId(created.id);
      setMessage("Campaign created as draft. Add prizes (name, total, image), then activate.");
      setManageTab("prizes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setBusy(false);
    }
  }

  async function setCampaignStatus(campaignId: string, nextStatus: string) {
    if (!token || !business?.id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateLuckySpinCampaign(token, business.id, campaignId, {
        status: nextStatus,
      });
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setMessage(`Campaign marked ${nextStatus}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update campaign");
    } finally {
      setBusy(false);
    }
  }

  async function setCampaignOddsMode(
    campaignId: string,
    nextMode: "auto" | "manual",
  ) {
    if (!token || !business?.id) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateLuckySpinCampaign(token, business.id, campaignId, {
        odds_mode: nextMode,
      });
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (campaignId === selectedCampaignId) {
        await loadPrizes();
      }
      setMessage(
        nextMode === "auto"
          ? "Odds mode: Auto — win chances follow quantity."
          : "Odds mode: Manual — set each prize percentage (must total 100%).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update odds mode");
    } finally {
      setBusy(false);
    }
  }

  async function savePrizeProbability(prizeId: string, raw: string) {
    if (!token || !business?.id || !selectedCampaignId || oddsMode !== "manual") return;
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      setError("Probability must be between 0 and 100");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateLuckySpinPrize(token, business.id, selectedCampaignId, prizeId, {
        probability: value,
      });
      await loadPrizes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update probability");
    } finally {
      setBusy(false);
    }
  }

  function resetPrizeModalFields() {
    if (prizeImagePreviewRef.current) {
      URL.revokeObjectURL(prizeImagePreviewRef.current);
      prizeImagePreviewRef.current = null;
    }
    setPrizeItemName("");
    setPrizeQuantity("");
    setPrizeProbability("");
    setPrizeImage(null);
    setPrizeImagePreview(null);
    setPrizeModalError(null);
  }

  function openPrizeModal() {
    resetPrizeModalFields();
    setPrizeModalOpen(true);
  }

  function closePrizeModal() {
    if (savingPrize) return;
    setPrizeModalOpen(false);
    resetPrizeModalFields();
  }

  function setPrizeImageFile(file: File | null) {
    if (prizeImagePreviewRef.current) {
      URL.revokeObjectURL(prizeImagePreviewRef.current);
      prizeImagePreviewRef.current = null;
    }
    if (!file) {
      setPrizeImage(null);
      setPrizeImagePreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setPrizeModalError("Image must be PNG, JPG, or WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPrizeModalError("Image must be 5 MB or smaller.");
      return;
    }
    const preview = URL.createObjectURL(file);
    prizeImagePreviewRef.current = preview;
    setPrizeModalError(null);
    setPrizeImage(file);
    setPrizeImagePreview(preview);
  }

  async function submitPrizeModal() {
    if (!token || !business?.id || !selectedCampaignId) return;
    const name = prizeItemName.trim();
    const quantity = Number(prizeQuantity);
    if (!name) {
      setPrizeModalError("Item name is required.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setPrizeModalError("Quantity must be a whole number of at least 1.");
      return;
    }
    let probability: number | undefined;
    if (oddsMode === "manual") {
      probability = Number(prizeProbability);
      if (Number.isNaN(probability) || probability < 0 || probability > 100) {
        setPrizeModalError("Win probability must be between 0 and 100.");
        return;
      }
    }
    if (!prizeImage) {
      setPrizeModalError("Image is required.");
      return;
    }

    setSavingPrize(true);
    setPrizeModalError(null);
    try {
      const created = await api.createLuckySpinPrize(token, business.id, selectedCampaignId, {
        name,
        stock: quantity,
        ...(probability === undefined ? {} : { probability }),
        enabled: true,
      });
      await api.uploadLuckySpinPrizeImage(
        token,
        business.id,
        selectedCampaignId,
        created.id,
        prizeImage,
      );
      setPrizeModalOpen(false);
      resetPrizeModalFields();
      await loadPrizes();
      setMessage("Prize added.");
    } catch (err) {
      setPrizeModalError(err instanceof Error ? err.message : "Failed to add prize");
    } finally {
      setSavingPrize(false);
    }
  }

  async function onPrizeImage(prizeId: string, file: File | null) {
    if (!token || !business?.id || !selectedCampaignId || !file) return;
    setBusy(true);
    try {
      await api.uploadLuckySpinPrizeImage(
        token,
        business.id,
        selectedCampaignId,
        prizeId,
        file,
      );
      await loadPrizes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!token || !business?.id || !redeemCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.redeemLuckySpinVoucher(token, business.id, redeemCode.trim());
      setMessage(`Redeemed ${result.voucher_code}`);
      setRedeemCode("");
      const res = await api.listLuckySpinWinners(token, business.id);
      setWinners(res.items);
      setWinnersTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Redeem failed");
    } finally {
      setBusy(false);
    }
  }

  const priceLabel = (status?.addon.price_display ?? "Rp199.000/month").replace(
    /\/\s*month/i,
    "",
  );
  const productName = status?.addon.name ?? "Lucky Spin";
  const productDescription =
    status?.addon.description ??
    "Branded lucky-spin campaigns with prizes, vouchers, and customer-screen widget.";

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  const manageTabs: Array<{ id: ManageTab; label: string }> = [
    { id: "display", label: "Display" },
    { id: "campaigns", label: "Campaigns" },
    { id: "prizes", label: "Prizes" },
    { id: "winners", label: "Winners" },
    { id: "analytics", label: "Analytics" },
  ];

  return (
    <>
      <div className="mx-auto w-full max-w-3xl space-y-10 pb-24">
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        {loading ? (
          <div className="flex gap-4">
            <div className="size-[88px] shrink-0 animate-pulse rounded-[22px] bg-slate-100" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-7 w-48 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ) : (
          <header className="flex items-start gap-4 sm:gap-5">
            <div className="flex size-[88px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm sm:size-[104px] sm:rounded-[26px]">
              <TrophyIcon className="size-10 text-white sm:size-12" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-[28px]">
                {productName}
              </h1>
              <p className="mt-0.5 text-sm text-orange-600 sm:text-[15px]">LORESCALE Add-on</p>
              <p className="mt-2 text-sm text-slate-500">
                {isActive ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <CheckCircleIcon className="size-4" aria-hidden />
                    Installed
                  </span>
                ) : isPending ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                    <ClockIcon className="size-4" aria-hidden />
                    Pending approval
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-slate-900">{priceLabel}</span>
                    <span className="text-slate-400"> / month · per workspace</span>
                  </>
                )}
              </p>
            </div>
          </header>
        )}

        {!loading && !isActive ? (
          <>
            <section className="-mx-4 sm:mx-0">
              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] sm:px-0 [&::-webkit-scrollbar]:hidden">
                {SCREENSHOTS.map((shot) => (
                  <div
                    key={shot.id}
                    className="w-[72%] shrink-0 snap-center overflow-hidden rounded-[20px] bg-slate-100 sm:w-[240px]"
                  >
                    <div className="aspect-[9/16]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.src}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">About</h2>
              <p className="text-[15px] leading-relaxed text-slate-600">
                {productDescription} After guests finish talking with the assistant, they can spin
                for a prize, enter their phone number, and receive a unique voucher code to redeem
                in store.
              </p>
              <p className="text-[15px] leading-relaxed text-slate-600">
                When Lucky Spin is enabled on the kiosk, the spin widget appears in the center and
                the 3D avatar moves to the bottom-right corner at half size.
              </p>
            </section>

            <section>
              <h2 className="mb-1 text-xl font-semibold tracking-tight text-slate-900">Features</h2>
              <ul className="divide-y divide-slate-100">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-4 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-slate-900">
                Information
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <dt className="text-slate-400">Provider</dt>
                  <dd className="font-medium text-slate-900">LORESCALE</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <dt className="text-slate-400">Category</dt>
                  <dd className="font-medium text-slate-900">Engagement</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <dt className="text-slate-400">Billing</dt>
                  <dd className="font-medium text-slate-900">Monthly · per workspace</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Price</dt>
                  <dd className="font-medium text-slate-900">{priceLabel}/mo</dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}

        {isActive && settingsReady ? (
          <>
            <section className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Configuration</h2>
              <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                {manageTabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setManageTab(item.id)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition",
                      manageTab === item.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {manageTab === "display" ? (
                <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
                  <p className="text-sm text-muted-foreground">
                    When enabled, the Lucky Spin widget will appear on the customer screen and the
                    3D avatar will move to the bottom-right corner.
                  </p>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <label
                      htmlFor="lucky-spin-enabled"
                      className="text-sm font-medium text-slate-800"
                    >
                      Enable Lucky Spin on kiosk
                    </label>
                    <Switch
                      id="lucky-spin-enabled"
                      checked={enabled}
                      disabled={busy}
                      onCheckedChange={(checked) => void toggleEnabled(checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="min-w-0">
                      <label
                        htmlFor="lucky-spin-ai-voice"
                        className="text-sm font-medium text-slate-800"
                      >
                        AI voice congratulations
                      </label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Turn off if a live MC will announce winners.
                      </p>
                    </div>
                    <Switch
                      id="lucky-spin-ai-voice"
                      checked={aiVoiceEnabled}
                      disabled={busy}
                      onCheckedChange={(checked) => void toggleAiVoice(checked)}
                    />
                  </div>
                </div>
              ) : null}

              {manageTab === "campaigns" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-4">
                    <input
                      className="min-w-[16rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder="Campaign name"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                    />
                    <Button
                      disabled={busy || !campaignName.trim()}
                      onClick={() => void createCampaign()}
                    >
                      Create campaign
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {campaigns.map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          "rounded-2xl border bg-card p-4",
                          selectedCampaignId === c.id ? "border-orange-300" : "border-border",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <button
                              type="button"
                              className="font-medium hover:underline"
                              onClick={() => setSelectedCampaignId(c.id)}
                            >
                              {c.name}
                            </button>
                            <p className="text-xs text-muted-foreground">
                              Status: {c.status} · one per user: {c.one_per_user ? "yes" : "no"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {c.status !== "active" ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => void setCampaignStatus(c.id, "active")}
                              >
                                Activate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void setCampaignStatus(c.id, "ended")}
                              >
                                End
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedCampaignId(c.id);
                                setManageTab("prizes");
                              }}
                            >
                              Prizes
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                          <div>
                            <p className="text-sm font-medium text-slate-800">Win odds</p>
                            <p className="text-xs text-muted-foreground">
                              {(c.odds_mode ?? "auto") === "manual"
                                ? "Manual percentages (must total 100%)"
                                : "Auto from quantity"}
                            </p>
                          </div>
                          <div className="flex rounded-lg bg-slate-100 p-0.5">
                            {(["auto", "manual"] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                disabled={busy}
                                onClick={() => void setCampaignOddsMode(c.id, mode)}
                                className={cn(
                                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition",
                                  (c.odds_mode ?? "auto") === mode
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-600 hover:text-slate-900",
                                )}
                              >
                                {mode}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    {campaigns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {manageTab === "prizes" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-sm text-muted-foreground">Campaign</label>
                    <select
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={selectedCampaignId}
                      onChange={(e) => setSelectedCampaignId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.status})
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedCampaignId ? (
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">Wheel prizes</p>
                          <p className="text-xs text-muted-foreground">
                            {oddsMode === "manual"
                              ? "Set name, quantity, image, and win % (must total 100%)."
                              : "Add items with a name, quantity, and image. Odds follow quantity."}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {prizes.length > 0 ? (
                            <p
                              className={cn(
                                "text-xs font-medium",
                                Math.abs(probabilityTotal - 100) > 0.01
                                  ? "text-amber-600"
                                  : "text-emerald-600",
                              )}
                            >
                              Total odds {probabilityTotal.toFixed(2)}%
                            </p>
                          ) : null}
                          <Button type="button" disabled={busy} onClick={openPrizeModal}>
                            <PlusIcon className="size-4" />
                            Add prize
                          </Button>
                        </div>
                      </div>

                      <div className="hidden grid-cols-[56px_minmax(0,1fr)_72px_88px_72px] gap-3 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                        <span>Image</span>
                        <span>Item name</span>
                        <span>Qty</span>
                        <span>Win %</span>
                        <span className="text-right"> </span>
                      </div>

                      {prizes.length === 0 ? (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No prizes yet. Click Add prize to create one.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border">
                          {prizes.map((p) => (
                            <li
                              key={p.id}
                              className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[56px_minmax(0,1fr)_72px_88px_72px]"
                            >
                              <label className="relative size-14 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-slate-100">
                                {p.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={p.image_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-full items-center justify-center text-[10px] text-slate-400">
                                    Image
                                  </span>
                                )}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  disabled={busy}
                                  onChange={(e) =>
                                    void onPrizeImage(p.id, e.target.files?.[0] ?? null)
                                  }
                                />
                              </label>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {p.name}
                                </p>
                                <p className="text-xs text-muted-foreground sm:hidden">
                                  Qty {p.stock}
                                  {oddsMode === "auto" ? ` · ${p.probability}%` : ""}
                                </p>
                                {oddsMode === "manual" ? (
                                  <div className="mt-1 flex items-center gap-1 sm:hidden">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={0.01}
                                      defaultValue={p.probability}
                                      key={`${p.id}-m-${p.probability}`}
                                      disabled={busy}
                                      onBlur={(e) =>
                                        void savePrizeProbability(p.id, e.target.value)
                                      }
                                      className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm"
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                ) : null}
                              </div>
                              <p className="hidden text-sm text-slate-700 sm:block">{p.stock}</p>
                              {oddsMode === "manual" ? (
                                <div className="hidden items-center gap-1 sm:flex">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.01}
                                    defaultValue={p.probability}
                                    key={`${p.id}-${p.probability}`}
                                    disabled={busy}
                                    onBlur={(e) =>
                                      void savePrizeProbability(p.id, e.target.value)
                                    }
                                    className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm"
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                              ) : (
                                <p className="hidden text-sm text-slate-700 sm:block">
                                  {p.probability}%
                                </p>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="justify-self-end"
                                disabled={busy}
                                onClick={() =>
                                  void (async () => {
                                    if (!token || !business?.id) return;
                                    setBusy(true);
                                    setError(null);
                                    setMessage(null);
                                    try {
                                      await api.deleteLuckySpinPrize(
                                        token,
                                        business.id,
                                        selectedCampaignId,
                                        p.id,
                                      );
                                      await loadPrizes();
                                      setMessage("Prize deleted.");
                                    } catch (err) {
                                      setError(
                                        err instanceof Error
                                          ? err.message
                                          : "Failed to delete prize",
                                      );
                                    } finally {
                                      setBusy(false);
                                    }
                                  })()
                                }
                              >
                                Delete
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select or create a campaign first.
                    </p>
                  )}
                </div>
              ) : null}

              {manageTab === "winners" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Total winners{" "}
                        <span className="tabular-nums text-slate-600">{winnersTotal}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Deleting a prize does not remove winner or voucher history.
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2 sm:min-w-[20rem]">
                      <input
                        className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        placeholder="Search voucher / phone"
                        value={voucherSearch}
                        onChange={(e) => setVoucherSearch(e.target.value)}
                      />
                      <input
                        className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        placeholder="Redeem voucher code"
                        value={redeemCode}
                        onChange={(e) => setRedeemCode(e.target.value)}
                      />
                      <Button disabled={busy || !redeemCode.trim()} onClick={() => void redeem()}>
                        Mark redeemed
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Voucher</th>
                          <th className="px-3 py-2">Prize</th>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Won</th>
                        </tr>
                      </thead>
                      <tbody>
                        {winners.map((w) => (
                          <tr key={w.id} className="border-t border-border">
                            <td className="px-3 py-2 font-mono text-xs">{w.voucher_code}</td>
                            <td className="px-3 py-2">{w.prize_name}</td>
                            <td className="px-3 py-2">
                              {w.customer_name || "—"}
                              <div className="text-xs text-muted-foreground">
                                {w.customer_identifier}
                              </div>
                            </td>
                            <td className="px-3 py-2">{w.status}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {new Date(w.won_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {winners.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">No winners yet.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {manageTab === "analytics" ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Total spins", analytics?.total_spins ?? 0],
                    ["Unique users", analytics?.unique_users ?? 0],
                    ["Redeemed", analytics?.redeemed_count ?? 0],
                    ["Redemption rate", `${analytics?.redemption_rate ?? 0}%`],
                    ["Remaining stock", analytics?.remaining_stock ?? 0],
                    ["Top prize", analytics?.top_prize ?? "—"],
                  ].map(([label, value]) => (
                    <div
                      key={label as string}
                      className="rounded-2xl border border-border bg-card p-4"
                    >
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      <p className="mt-2 text-xl font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </>
        ) : isActive ? (
          <AddonConfigPending />
        ) : null}
      </div>

      <footer
        style={footerStyle}
        className="fixed bottom-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Button type="button" variant="outline" asChild>
            <Link href={adminPath(slug, "/add-ons")}>Back</Link>
          </Button>
          {isActive || isPending ? (
            <Button type="button" disabled>
              {isActive ? "Active" : "Requested"}
            </Button>
          ) : loading ? (
            <Button type="button" disabled>
              Subscribe
            </Button>
          ) : (
            <Button type="button" asChild>
              <Link href={adminPath(slug, "/add-ons/lucky-spin/payment")}>Subscribe</Link>
            </Button>
          )}
        </div>
      </footer>

      {prizeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closePrizeModal}
            aria-label="Close dialog"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lucky-spin-prize-modal-title"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2
                  id="lucky-spin-prize-modal-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Add prize
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Item shown on the spin wheel.
                </p>
              </div>
              <button
                type="button"
                onClick={closePrizeModal}
                aria-label="Close"
                disabled={savingPrize}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label
                  htmlFor="prize-item-name"
                  className="block text-sm font-medium text-slate-700"
                >
                  Item name
                </label>
                <input
                  id="prize-item-name"
                  value={prizeItemName}
                  onChange={(e) => setPrizeItemName(e.target.value)}
                  disabled={savingPrize}
                  placeholder="e.g. tumbler"
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="prize-quantity"
                  className="block text-sm font-medium text-slate-700"
                >
                  Quantity
                </label>
                <input
                  id="prize-quantity"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={prizeQuantity}
                  onChange={(e) => setPrizeQuantity(e.target.value)}
                  disabled={savingPrize}
                  placeholder="e.g. 30"
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60"
                />
              </div>

              {oddsMode === "manual" ? (
                <div>
                  <label
                    htmlFor="prize-probability"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Win probability (%)
                  </label>
                  <input
                    id="prize-probability"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    inputMode="decimal"
                    value={prizeProbability}
                    onChange={(e) => setPrizeProbability(e.target.value)}
                    disabled={savingPrize}
                    placeholder="e.g. 25"
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Enabled prizes must total 100% before activating.
                    {prizes.length > 0
                      ? ` Current total: ${probabilityTotal.toFixed(2)}%.`
                      : ""}
                  </p>
                </div>
              ) : null}

              <div>
                <p className="block text-sm font-medium text-slate-700">Image</p>
                <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-orange-400 hover:bg-orange-50/40">
                  {prizeImagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={prizeImagePreview}
                      alt=""
                      className="mb-3 h-28 w-28 rounded-lg object-cover"
                    />
                  ) : null}
                  <span className="text-sm font-medium text-slate-700">
                    {prizeImage ? prizeImage.name : "Choose image"}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">PNG, JPG, or WEBP · max 5 MB</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={savingPrize}
                    onChange={(e) => setPrizeImageFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {prizeModalError ? (
                <p className="text-sm text-red-600" role="alert">
                  {prizeModalError}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={savingPrize}
                onClick={closePrizeModal}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={
                  savingPrize ||
                  !prizeItemName.trim() ||
                  !prizeQuantity.trim() ||
                  !prizeImage ||
                  (oddsMode === "manual" && !prizeProbability.trim())
                }
                onClick={() => void submitPrizeModal()}
              >
                {savingPrize ? "Saving…" : "Add prize"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
