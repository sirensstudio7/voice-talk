"use client";

import { BookOpen, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface MenuProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  image_url?: string;
}

interface MenuResponse {
  business: string;
  products: MenuProduct[];
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
  const showImage = item.image_url && !imageError;

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-square w-full bg-slate-100">
        {showImage ? (
          <Image
            src={item.image_url!}
            alt={item.name}
            fill
            sizes="(max-width: 448px) 50vw, 224px"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 text-2xl">
            ☕
          </div>
        )}
        <div className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-orange-600 shadow-sm backdrop-blur-sm">
          ${item.price.toFixed(2)}
        </div>
      </div>

      <div className="px-3 py-2.5">
        <p className="text-xs font-bold text-slate-900">{item.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-600">
          {item.description}
        </p>
      </div>
    </li>
  );
}

interface StoreMenuPanelProps {
  onClose: () => void;
  visible: boolean;
}

function StoreMenuPanel({ onClose, visible }: StoreMenuPanelProps) {
  const [business, setBusiness] = useState("Sunrise Coffee");
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${API_URL}/menu`);
        if (!response.ok) throw new Error("Unable to load menu.");
        const data = (await response.json()) as MenuResponse;
        if (cancelled) return;
        setBusiness(data.business);
        setProducts(data.products);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load menu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => groupByCategory(products), [products]);

  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-label="Close menu"
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl transition-transform duration-300 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((key) => (
                <div
                  key={key}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="aspect-square animate-pulse bg-slate-200" />
                  <div className="space-y-2 px-3 py-2.5">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-2 w-full animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
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
      </aside>
    </>
  );
}

export function StoreMenuButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frame);
    }

    setIsVisible(false);
    const timer = window.setTimeout(() => setIsRendered(false), 300);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute bottom-8 right-6 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-md backdrop-blur-sm transition hover:bg-white hover:scale-[1.02] active:scale-[0.98]"
        aria-label="View menu"
      >
        <BookOpen className="h-4 w-4 text-orange-500" />
        Menu
      </button>

      {isRendered ? (
        <StoreMenuPanel visible={isVisible} onClose={() => setIsOpen(false)} />
      ) : null}
    </>
  );
}
