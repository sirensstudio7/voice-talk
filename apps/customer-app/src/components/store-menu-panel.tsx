"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Minus, Plus, X } from "lucide-react";

import { slideOverBackdropClass, slideOverPanelClass, useSlideOver } from "@/components/slide-over";

import { useBusinessSlug } from "@/context/business-context";
import { fetchMenu, menuFetchErrorMessage, type MenuProduct } from "@/lib/menu-api";
import { useSessionStore } from "@/store/session-store";
import { formatCurrency } from "@voicetalk/shared";

function resolveMediaUrl(path: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${apiUrl}${path}`;
}
function groupByCategory(products: MenuProduct[]) {
  return products.reduce<Record<string, MenuProduct[]>>((groups, product) => {
    const category = product.category;
    if (!groups[category]) groups[category] = [];
    groups[category].push(product);
    return groups;
  }, {});
}

interface MenuProductCardProps {
  item: MenuProduct;
}

function MenuProductCard({ item }: MenuProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  const showImage = item.image_url && !imageError;
  const resolvedImageUrl = resolveMediaUrl(item.image_url ?? "");
  const addItemToOrder = useSessionStore((s) => s.addItemToOrder);
  const decrementItemFromOrder = useSessionStore((s) => s.decrementItemFromOrder);
  const removeItemFromOrder = useSessionStore((s) => s.removeItemFromOrder);
  const order = useSessionStore((s) => s.order);
  const inBasket = order.items.find((i) => i.product_id === item.id)?.quantity ?? 0;
  const canAdd = order.status !== "confirmed";
  const checkoutPhase = useSessionStore((s) => s.checkoutPhase);
  const canAddItems = canAdd && checkoutPhase === "shopping";

  const handleAdd = () => {
    const fromRect = imageRef.current?.getBoundingClientRect();
    addItemToOrder(
      {
        product_id: item.id,
        name: item.name,
        price: item.price,
      },
      1,
      {
        fromRect,
        imageUrl: item.image_url,
      },
    );
  };

  const handleRemove = () => {
    if (inBasket <= 1) {
      removeItemFromOrder(item.id);
    } else {
      decrementItemFromOrder(item.id);
    }
  };

  return (
    <li
      className={`group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition hover:shadow-md active:scale-[0.99] ${
        inBasket > 0
          ? "ring-orange-300/80 shadow-orange-100/50"
          : "ring-slate-200/80"
      }`}
    >
      <div className="px-1 pt-1">
        <div
          ref={imageRef}
          className="relative aspect-[7/6] w-full overflow-hidden rounded-xl bg-slate-100"
        >
          {showImage ? (
            <Image
              src={resolvedImageUrl}
              alt={item.name}
              fill
              sizes="(max-width: 448px) 50vw, 224px"
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 text-3xl">
              ☕
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/10 to-transparent" />
          {inBasket > 0 ? (
            <span className="absolute left-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold tabular-nums text-white shadow-sm">
              {inBasket}
            </span>
          ) : null}
          {item.discount_percent && item.discount_percent > 0 ? (
            <span className="absolute right-2 top-2 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
              -{item.discount_percent % 1 === 0 ? item.discount_percent : item.discount_percent.toFixed(1)}%
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="min-h-0 flex-1">
          <p className="line-clamp-1 text-[13px] font-semibold leading-tight tracking-tight text-slate-900">
            {item.name}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
            {item.description}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
          {item.original_price && item.original_price > item.price ? (
            <div className="flex flex-col">
              <p className="text-sm font-bold tabular-nums tracking-tight text-orange-600">
                {formatCurrency(item.price)}
              </p>
              <p className="text-[11px] tabular-nums text-slate-400 line-through">
                {formatCurrency(item.original_price)}
              </p>
            </div>
          ) : (
            <p className="text-sm font-bold tabular-nums tracking-tight text-slate-900">
              {formatCurrency(item.price)}
            </p>
          )}
          {canAddItems ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {inBasket > 0 ? (
                <button
                  type="button"
                  onClick={handleRemove}
                  aria-label={`Remove one ${item.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                >
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleAdd}
                aria-label={inBasket > 0 ? `Add another ${item.name}` : `Add ${item.name} to basket`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition hover:bg-orange-600 hover:shadow-md active:scale-95"
                style={{
                  boxShadow: "rgba(255, 255, 255, 0.3) 0px 1.5px 3px 0px inset",
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

interface StoreMenuPanelProps {
  onClose: () => void;
  visible: boolean;
}

function StoreMenuPanel({ onClose, visible }: StoreMenuPanelProps) {
  const businessSlug = useBusinessSlug();
  const menuCache = useSessionStore((s) => s.menuCache);
  const menuCacheSlug = useSessionStore((s) => s.menuCacheSlug);
  const setMenuCache = useSessionStore((s) => s.setMenuCache);
  const order = useSessionStore((s) => s.order);
  const checkoutPhase = useSessionStore((s) => s.checkoutPhase);
  const openCheckoutPanel = useSessionStore((s) => s.openCheckoutPanel);
  const closeMenuPanel = useSessionStore((s) => s.closeMenuPanel);
  const cachedMenu = menuCacheSlug === businessSlug ? menuCache : null;
  const [business, setBusiness] = useState(cachedMenu?.business ?? "Sunrise Coffee");
  const [products, setProducts] = useState<MenuProduct[]>(cachedMenu?.products ?? []);
  const [loading, setLoading] = useState(!cachedMenu);
  const [error, setError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (menuCacheSlug !== businessSlug || !menuCache) return;
    setBusiness(menuCache.business);
    setProducts(menuCache.products);
  }, [businessSlug, menuCache, menuCacheSlug]);

  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const showContinue = checkoutPhase === "shopping" && itemCount > 0;

  const handleContinue = () => {
    closeMenuPanel();
    openCheckoutPanel();
  };

  const loadMenu = useCallback(async () => {
    const { menuCache: cached, menuCacheSlug: cachedSlug } = useSessionStore.getState();
    const hasCache = cachedSlug === businessSlug && (cached?.products.length ?? 0) > 0;
    if (!hasCache) {
      setLoading(true);
    }
    setError(null);
    setRefreshWarning(null);

    try {
      const data = await fetchMenu(businessSlug);
      if (!visibleRef.current) return;
      setMenuCache(businessSlug, data);
      setBusiness(data.business);
      setProducts(data.products);
    } catch (err) {
      if (!visibleRef.current) return;
      const message = menuFetchErrorMessage(err);
      if (hasCache) {
        setRefreshWarning(message);
      } else {
        setError(message);
      }
    } finally {
      if (visibleRef.current) setLoading(false);
    }
  }, [businessSlug, setMenuCache]);

  useEffect(() => {
    if (!visible) return;
    void loadMenu();
  }, [visible, loadMenu, reloadKey]);

  const grouped = useMemo(() => groupByCategory(products), [products]);

  return (
    <>
      <button
        type="button"
        className={`${slideOverBackdropClass(visible)} z-40`}
        onClick={onClose}
        aria-label="Close menu"
      />

      <aside
        className={`${slideOverPanelClass(visible, "z-50 bg-slate-50")}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
              {business}
            </p>
            <h2 className="text-lg font-bold text-slate-900">Menu</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="Close menu panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto px-5 py-4 ${showContinue ? "pb-2" : ""}`}>
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((key) => (
                <div
                  key={key}
                  className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80"
                >
                  <div className="px-1 pt-1">
                    <div className="aspect-[7/6] animate-pulse rounded-xl bg-slate-200" />
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-2.5 w-full animate-pulse rounded bg-slate-100" />
                    <div className="flex items-center justify-between pt-1">
                      <div className="h-4 w-10 animate-pulse rounded bg-slate-200" />
                      <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {refreshWarning ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {refreshWarning}
                </p>
              ) : null}
              {Object.entries(grouped).map(([category, items]) => (
                <section key={category}>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {category}
                  </h3>
                  <ul className="grid grid-cols-2 gap-3">
                    {items.map((item) => (
                      <MenuProductCard key={item.id} item={item} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        {showContinue ? (
          <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex w-full items-center justify-center rounded-full bg-orange-500 py-3.5 text-[15px] font-semibold text-white transition hover:bg-orange-600 active:scale-[0.99]"
              style={{
                boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
              }}
            >
              Continue
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}

export function StoreMenuPanelRoot() {
  const menuPanelOpen = useSessionStore((s) => s.menuPanelOpen);
  const closeMenuPanel = useSessionStore((s) => s.closeMenuPanel);
  const { mounted, isRendered, isVisible } = useSlideOver(menuPanelOpen);

  if (!mounted || !isRendered) return null;

  return createPortal(
    <StoreMenuPanel visible={isVisible} onClose={closeMenuPanel} />,
    document.body,
  );
}

export function StoreMenuButton() {
  const businessSlug = useBusinessSlug();
  const openMenuPanel = useSessionStore((s) => s.openMenuPanel);
  const refreshMenuCache = useSessionStore((s) => s.refreshMenuCache);

  const handleClick = () => {
    openMenuPanel();
    void refreshMenuCache(businessSlug);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="absolute bottom-8 right-6 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm transition hover:bg-white hover:scale-[1.02] active:scale-[0.98]"
      aria-label="View menu"
    >
      <BookOpen className="h-4 w-4 text-orange-500" />
      Menu
    </button>
  );
}
