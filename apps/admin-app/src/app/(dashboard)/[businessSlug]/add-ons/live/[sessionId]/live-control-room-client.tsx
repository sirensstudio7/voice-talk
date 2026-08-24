"use client";

import {
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentListIcon,
  PaperAirplaneIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ShoppingBagIcon,
  StopIcon,
  TrashIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/24/solid";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { adminPath } from "@/lib/admin-path";
import {
  api,
  type LiveCatalogProduct,
  type LiveKnowledge,
  type LiveMessage,
  type LiveProduct,
  type LiveSession,
  type Order,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { customerAppUrl } from "@/lib/customer-app";
import { CURRENCY_PREFIX, formatCurrency } from "@/lib/currency";
import { playLivePcm, playLiveWavBase64, speakLiveText, unlockLiveAudio } from "@/lib/live-audio";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

const LIVE_PRODUCT_CATEGORIES = [
  "Apparel",
  "Beauty",
  "Accessories",
  "Home",
  "Food",
  "Drinks",
  "Other",
] as const;

const emptyUploadForm = {
  name: "",
  product_id: "",
  price: "",
  discount_percent: "",
  category: "Apparel",
  description: "",
  image_url: "",
};

function effectivePrice(price: number, discountPercent: number): number {
  if (discountPercent <= 0) return price;
  return Math.round(price * (1 - Math.min(discountPercent, 100) / 100));
}

function ProductPrice({ price, discountPercent }: { price: number; discountPercent: number }) {
  const salePrice = effectivePrice(price, discountPercent);
  if (discountPercent > 0) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-sm font-bold tabular-nums tracking-tight text-red-600">
          {formatCurrency(salePrice)}
        </p>
        <p className="text-xs tabular-nums text-slate-400 line-through">{formatCurrency(price)}</p>
        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
          -{discountPercent % 1 === 0 ? discountPercent : discountPercent.toFixed(1)}%
        </span>
      </div>
    );
  }
  return (
    <p className="text-sm font-bold tabular-nums tracking-tight text-slate-900">
      {formatCurrency(price)}
    </p>
  );
}

function LiveProductCard({
  product,
  selected,
  featuring,
  onToggle,
  onEdit,
  onDelete,
}: {
  product: LiveCatalogProduct;
  selected: boolean;
  featuring: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  const listPrice = product.list_price ?? product.price;
  const discountPercent = product.discount_percent ?? 0;
  const previewUrl = resolveMediaUrl(product.image_url);
  const showImage = Boolean(previewUrl) && !imageError;

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 transition active:scale-[0.99] ${
        selected ? "ring-red-200 shadow-sm" : "ring-slate-200/80"
      } ${featuring ? "ring-red-400" : ""}`}
    >
      <div className="px-1 pt-1">
        <div className="relative aspect-[7/6] w-full overflow-hidden rounded-xl bg-slate-100">
          <button type="button" onClick={onEdit} className="absolute inset-0 text-left" aria-label={`Edit ${product.name}`}>
            {showImage ? (
              <Image
                src={previewUrl}
                alt=""
                fill
                unoptimized
                sizes="220px"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-red-50 via-rose-50 to-orange-50 text-3xl">
                🛍️
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/10 to-transparent" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-pressed={selected}
            aria-label={selected ? `Remove ${product.name} from the show` : `Add ${product.name} to the show`}
            className={`absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-md shadow-sm ${
              selected ? "bg-red-500 text-white" : "bg-white/95 text-transparent ring-1 ring-slate-200"
            }`}
          >
            {selected ? <CheckIcon className="size-3.5" /> : null}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <p className="line-clamp-1 text-sm font-semibold leading-tight tracking-tight text-slate-900">
            {product.name}
          </p>
          {product.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-500">{product.description}</p>
          ) : null}
        </button>
        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
          <ProductPrice price={listPrice} discountPercent={discountPercent} />
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              aria-label={`Edit ${product.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              aria-label={`Delete ${product.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function slugifyProductId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const inputClassName =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-red-500";

function FormField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function CategorySelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const resolvedOptions = useMemo(() => {
    if (options.includes(value)) return [...options];
    return [value, ...options];
  }, [value, options]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5 text-left text-sm transition-colors ${
          open ? "border-red-300 ring-2 ring-red-500/20" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <span className="font-medium text-slate-900">{value}</span>
        <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute z-20 mt-1.5 max-h-48 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 ring-1 ring-slate-200/80"
        >
          {resolvedOptions.map((option) => {
            const selected = option === value;
            return (
              <li key={option} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2.5 text-sm transition-colors ${
                    selected
                      ? "bg-red-50 font-medium text-red-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function ProductImageField({
  imageUrl,
  name,
  uploading,
  uploadError,
  onUpload,
  onChangeUrl,
  onClear,
}: {
  imageUrl: string;
  name: string;
  uploading: boolean;
  uploadError: string | null;
  onUpload: (file: File) => void;
  onChangeUrl: (value: string) => void;
  onClear: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = resolveMediaUrl(imageUrl);

  return (
    <FormField
      id="live-product-image"
      label="Product image"
      hint="Upload a photo or paste an image URL — shown to viewers on the show."
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = "";
        }}
      />

      {previewUrl ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="relative aspect-[7/6] w-full bg-slate-100">
            <Image
              src={previewUrl}
              alt={name || "Product preview"}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
          <div className="flex gap-2 border-t border-slate-200 bg-white p-3">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowUpTrayIcon className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={onClear}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowUpTrayIcon className="h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            {uploading ? "Uploading…" : "Upload image"}
          </p>
          <p className="mt-1 text-xs text-slate-500">PNG, JPG, WEBP, or GIF up to 5 MB</p>
        </button>
      )}

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-2 text-xs text-slate-400">or paste URL</span>
        </div>
      </div>

      <input
        id="live-product-image-url"
        className={inputClassName}
        placeholder="https://…"
        value={imageUrl}
        onChange={(event) => onChangeUrl(event.target.value)}
      />

      {uploadError ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{uploadError}</p>
      ) : null}
    </FormField>
  );
}

function LiveProductFormModal({
  open,
  editing,
  form,
  saving,
  isFormValid,
  uploadingImage,
  uploadImageError,
  onClose,
  onSubmit,
  onChange,
  onUploadImage,
  onClearImage,
}: {
  open: boolean;
  editing: boolean;
  form: typeof emptyUploadForm;
  saving: boolean;
  isFormValid: boolean;
  uploadingImage: boolean;
  uploadImageError: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (form: typeof emptyUploadForm) => void;
  onUploadImage: (file: File) => void;
  onClearImage: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const salePreview =
    form.price &&
    form.discount_percent &&
    !Number.isNaN(Number(form.price)) &&
    !Number.isNaN(Number(form.discount_percent)) &&
    Number(form.discount_percent) > 0
      ? formatCurrency(effectivePrice(Number(form.price), Number(form.discount_percent)))
      : null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-product-form-title"
        className="relative z-10 flex max-h-[min(90vh,800px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="live-product-form-title" className="text-base font-semibold text-slate-900">
              {editing ? "Edit LIVE product" : "Add LIVE product"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              LIVE-only catalog — viewers see this on the show, not on the kiosk menu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <ProductImageField
              imageUrl={form.image_url}
              name={form.name}
              uploading={uploadingImage}
              uploadError={uploadImageError}
              onUpload={onUploadImage}
              onChangeUrl={(image_url) => onChange({ ...form, image_url })}
              onClear={onClearImage}
            />

            <FormField id="live-product-name" label="Name" hint="Display name shown to viewers.">
              <input
                id="live-product-name"
                className={inputClassName}
                placeholder="Cotton T-Shirt"
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value;
                  const previousSlug = slugifyProductId(form.name);
                  const keepSynced =
                    !form.product_id.trim() || form.product_id === previousSlug;
                  onChange({
                    ...form,
                    name,
                    product_id: keepSynced ? slugifyProductId(name) : form.product_id,
                  });
                }}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="live-product-id" label="Product ID" hint="SKU used at checkout.">
                <input
                  id="live-product-id"
                  className={`${inputClassName} font-mono`}
                  placeholder="cotton-tshirt"
                  value={form.product_id}
                  onChange={(event) => onChange({ ...form, product_id: event.target.value })}
                />
              </FormField>

              <FormField id="live-product-price" label="Price">
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">
                    {CURRENCY_PREFIX}
                  </span>
                  <input
                    id="live-product-price"
                    type="number"
                    min="0"
                    step="1"
                    className={`${inputClassName} pl-9 tabular-nums`}
                    placeholder="125000"
                    value={form.price}
                    onChange={(event) => onChange({ ...form, price: event.target.value })}
                  />
                </div>
              </FormField>
            </div>

            <FormField
              id="live-product-discount"
              label="Discount"
              hint="Optional percentage off the list price. Leave empty for no discount."
            >
              <div className="relative">
                <input
                  id="live-product-discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className={`${inputClassName} pr-8 tabular-nums`}
                  placeholder="0"
                  value={form.discount_percent}
                  onChange={(event) => onChange({ ...form, discount_percent: event.target.value })}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">
                  %
                </span>
              </div>
              {salePreview ? (
                <p className="mt-1.5 text-xs text-red-600">Sale price: {salePreview}</p>
              ) : null}
            </FormField>

            <FormField id="live-product-category" label="Category">
              <CategorySelect
                id="live-product-category"
                value={form.category}
                options={LIVE_PRODUCT_CATEGORIES}
                onChange={(category) => onChange({ ...form, category })}
              />
            </FormField>

            <FormField id="live-product-description" label="Description">
              <textarea
                id="live-product-description"
                className={`${inputClassName} min-h-20 resize-y`}
                placeholder="Soft cotton tee. Available in S–XL."
                value={form.description}
                onChange={(event) => onChange({ ...form, description: event.target.value })}
              />
            </FormField>
          </div>

          <div className="flex shrink-0 gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingImage || !isFormValid}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editing ? <PencilIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
              {saving ? (editing ? "Saving…" : "Adding…") : editing ? "Save changes" : "Add product"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

type ControlRoomTab = "products" | "chat" | "knowledge" | "orders";

function ControlRoomTabs({
  tab,
  onChange,
  productCount,
  unreadChat,
  knowledgeCount,
  orderCount,
}: {
  tab: ControlRoomTab;
  onChange: (next: ControlRoomTab) => void;
  productCount: number;
  unreadChat: number;
  knowledgeCount: number;
  orderCount: number;
}) {
  const items: Array<{
    id: ControlRoomTab;
    label: string;
    icon: typeof ShoppingBagIcon;
    count?: number;
    alert?: number;
  }> = [
    { id: "products", label: "Products", icon: ShoppingBagIcon, count: productCount },
    { id: "chat", label: "Chat", icon: ChatBubbleLeftRightIcon, alert: unreadChat },
    { id: "knowledge", label: "Knowledge", icon: BookOpenIcon, count: knowledgeCount },
    { id: "orders", label: "Orders", icon: ClipboardDocumentListIcon, count: orderCount },
  ];

  return (
    <div
      role="tablist"
      aria-label="Control Room sections"
      className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-200 px-3 sm:gap-2 sm:px-4"
    >
      {items.map((item) => {
        const selected = tab === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={`relative flex items-center gap-2 px-3 py-3.5 text-sm transition ${
              selected
                ? "font-semibold text-slate-900"
                : "font-medium text-slate-500 hover:text-slate-800"
            }`}
          >
            <Icon
              className={`size-4 ${selected ? "text-red-500" : "text-slate-400"}`}
              aria-hidden
            />
            {item.label}
            {item.count != null ? (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                  selected ? "bg-red-50 font-medium text-red-600" : "bg-slate-100 text-slate-500"
                }`}
              >
                {item.count}
              </span>
            ) : null}
            {item.alert ? (
              <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-white">
                {item.alert}
              </span>
            ) : null}
            {selected ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-red-500" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function formatLiveOrderTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function LiveOrderCard({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const summary = order.items
    .map((item) => (item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name))
    .join(", ");

  return (
    <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{summary || "LIVE order"}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <UserIcon className="size-3.5 shrink-0 text-slate-400" />
            {order.customer_name?.trim() || "Guest"}
            <span aria-hidden>·</span>
            {formatLiveOrderTime(order.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(order.total)}</p>
          <ChevronDownIcon
            className={`size-4 text-slate-400 transition ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/80">
          <ul className="divide-y divide-slate-100 px-4 py-2">
            {order.items.map((item) => (
              <li
                key={`${order.id}-${item.product_id}`}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <p className="min-w-0 truncate text-slate-700">
                  {item.quantity > 1 ? `${item.quantity}× ` : null}
                  {item.name}
                </p>
                <span className="shrink-0 font-medium tabular-nums text-slate-900">
                  {formatCurrency(item.subtotal)}
                </span>
              </li>
            ))}
          </ul>
          {order.customer_phone || order.customer_address || order.customer_notes ? (
            <div className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm">
              {order.customer_phone ? (
                <p className="text-slate-600">
                  Phone: <span className="font-medium text-slate-900">{order.customer_phone}</span>
                </p>
              ) : null}
              {order.customer_address ? (
                <p className="text-slate-600">
                  Address: <span className="font-medium text-slate-900">{order.customer_address}</span>
                </p>
              ) : null}
              {order.customer_notes ? (
                <p className="text-slate-600">
                  Note: <span className="font-medium text-slate-900">{order.customer_notes}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function buildLiveWsUrl(sessionId: string, token: string) {
  const url = new URL(API_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/ws/live/${sessionId}`;
  url.searchParams.set("role", "host");
  url.searchParams.set("name", "Host");
  url.searchParams.set("token", token);
  return url.toString();
}

type Incoming =
  | { type: "chat.history"; items: LiveMessage[] }
  | { type: "chat.message"; message: LiveMessage }
  | { type: "viewer.count"; count: number }
  | { type: "session.status"; status: string }
  | { type: "product.show"; product: LiveProduct }
  | { type: "ai.audio"; wav_base64: string; duration_seconds: number }
  | { type: "ai.speak"; text: string };

export function LiveControlRoomClient() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const { token, business } = useAuth();
  const slug = business?.slug ?? "";

  const [session, setSession] = useState<LiveSession | null>(null);
  const [catalog, setCatalog] = useState<LiveCatalogProduct[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState(emptyUploadForm);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadImageError, setUploadImageError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [chat, setChat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "end" | "save" | null>(null);
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<LiveProduct | null>(null);
  const [knowledge, setKnowledge] = useState<LiveKnowledge[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [tab, setTab] = useState<ControlRoomTab>("products");
  const tabRef = useRef<ControlRoomTab>("products");
  const [unreadChat, setUnreadChat] = useState(0);
  const [liveOrders, setLiveOrders] = useState<Order[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pinChatToBottom = useRef(true);

  const watchUrl = useMemo(() => {
    if (!slug || !sessionId) return "";
    return `${customerAppUrl(slug)}/live/${sessionId}`;
  }, [slug, sessionId]);

  const productsDirty = useMemo(() => {
    const saved = new Set(
      (session?.products ?? []).filter((item) => item.live_only).map((item) => item.id),
    );
    if (saved.size !== selectedIds.length) return true;
    return selectedIds.some((id) => !saved.has(id));
  }, [session?.products, selectedIds]);

  const load = useCallback(async () => {
    if (!token || !business?.id || !sessionId) return;
    const [next, catalogItems, notes] = await Promise.all([
      api.getLiveSession(token, business.id, sessionId),
      api.listLiveCatalog(token, business.id),
      api.listLiveKnowledge(token, business.id, sessionId),
    ]);
    setSession(next);
    setSelectedIds(next.products.filter((item) => item.live_only).map((item) => item.id));
    setCatalog(catalogItems.items.filter((item) => item.is_active && item.live_only));
    setKnowledge(notes.items);
    try {
      const sessionOrders = await api.listLiveSessionOrders(token, business.id, sessionId);
      setLiveOrders(sessionOrders.items);
    } catch {
      setLiveOrders([]);
    }
  }, [token, business?.id, sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load room");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!token || !sessionId) return;
    const ws = new WebSocket(buildLiveWsUrl(sessionId, token));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          playLivePcm(event.data);
          return;
        }
        const data = JSON.parse(String(event.data)) as Incoming;
        if (data.type === "chat.history") setMessages(data.items);
        if (data.type === "chat.message") {
          setMessages((current) =>
            current.some((item) => item.id === data.message.id)
              ? current
              : [...current, data.message],
          );
          if (tabRef.current !== "chat") {
            setUnreadChat((count) => count + 1);
          }
        }
        if (data.type === "viewer.count") {
          setSession((current) => (current ? { ...current, viewer_count: data.count } : current));
        }
        if (data.type === "session.status") {
          setSession((current) => (current ? { ...current, status: data.status } : current));
        }
        if (data.type === "product.show") setHighlighted(data.product);
        if (data.type === "ai.audio" && data.wav_base64) {
          void playLiveWavBase64(data.wav_base64).catch(() => {
            // Browser may block until the host clicks once.
          });
        }
        if (data.type === "ai.speak" && data.text) {
          speakLiveText(data.text);
        }
      } catch {
        // ignore
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token, sessionId]);

  useEffect(() => {
    const unlock = () => {
      unlockLiveAudio();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const scrollChatToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    tabRef.current = tab;
    if (tab !== "chat") return;
    setUnreadChat(0);
    pinChatToBottom.current = true;
  }, [tab]);

  useEffect(() => {
    if (tab !== "chat" || !pinChatToBottom.current) return;
    const frame = window.requestAnimationFrame(() => {
      scrollChatToBottom();
      window.requestAnimationFrame(scrollChatToBottom);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, messages.length, scrollChatToBottom]);

  const loadOrders = useCallback(async () => {
    if (!token || !business?.id || !sessionId) return;
    try {
      const next = await api.listLiveSessionOrders(token, business.id, sessionId);
      setLiveOrders(next.items);
    } catch {
      // Keep the last known list if a poll fails.
    }
  }, [token, business?.id, sessionId]);

  useEffect(() => {
    if (tab !== "orders") return;
    void loadOrders();
    if (session?.status !== "live") return;
    const id = window.setInterval(() => void loadOrders(), 8000);
    return () => window.clearInterval(id);
  }, [tab, session?.status, loadOrders]);

  async function saveProducts() {
    if (!token || !business?.id || !sessionId) return;
    setBusy("save");
    setError(null);
    try {
      const next = await api.setLiveSessionProducts(token, business.id, sessionId, selectedIds);
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save products");
    } finally {
      setBusy(null);
    }
  }

  const uploadFormValid =
    uploadForm.name.trim().length > 0 &&
    uploadForm.price.trim().length > 0 &&
    !Number.isNaN(Number(uploadForm.price)) &&
    Number(uploadForm.price) >= 0 &&
    (uploadForm.discount_percent.trim().length === 0 ||
      (!Number.isNaN(Number(uploadForm.discount_percent)) &&
        Number(uploadForm.discount_percent) >= 0 &&
        Number(uploadForm.discount_percent) <= 100));

  const closeUploadForm = useCallback(() => {
    setUploadOpen(false);
    setEditingId(null);
    setUploadForm(emptyUploadForm);
    setUploadImageError(null);
  }, []);

  function openAddForm() {
    setEditingId(null);
    setUploadForm(emptyUploadForm);
    setUploadImageError(null);
    setUploadOpen(true);
  }

  function openEditForm(item: LiveCatalogProduct) {
    setEditingId(item.id);
    setUploadForm({
      name: item.name,
      product_id: item.product_id ?? "",
      price: String(item.list_price ?? item.price),
      discount_percent:
        item.discount_percent && item.discount_percent > 0 ? String(item.discount_percent) : "",
      category: item.category || "Apparel",
      description: item.description,
      image_url: item.image_url,
    });
    setUploadImageError(null);
    setUploadOpen(true);
  }

  async function refreshCatalog() {
    if (!token || !business?.id) return;
    const catalogItems = await api.listLiveCatalog(token, business.id);
    setCatalog(catalogItems.items.filter((item) => item.is_active && item.live_only));
  }

  async function handleUploadImage(file: File) {
    if (!token || !business?.id) return;
    setUploadingImage(true);
    setUploadImageError(null);
    try {
      const uploaded = await api.uploadProductImage(token, business.id, file);
      setUploadForm((current) => ({ ...current, image_url: uploaded.image_url }));
    } catch (err) {
      setUploadImageError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function uploadDedicatedProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !business?.id || !sessionId || !uploadFormValid) return;
    setUploadBusy(true);
    setError(null);
    const payload = {
      name: uploadForm.name.trim(),
      price: Number(uploadForm.price),
      product_id: uploadForm.product_id.trim(),
      discount_percent:
        uploadForm.discount_percent.trim().length > 0 ? Number(uploadForm.discount_percent) : 0,
      category: uploadForm.category.trim() || "Apparel",
      description: uploadForm.description.trim(),
      image_url: uploadForm.image_url.trim(),
    };
    try {
      if (editingId) {
        await api.updateLiveDedicatedProduct(token, business.id, editingId, payload);
        await refreshCatalog();
        setSession(await api.getLiveSession(token, business.id, sessionId));
      } else {
        const next = await api.createLiveDedicatedProduct(token, business.id, sessionId, payload);
        setSession(next);
        setSelectedIds(next.products.filter((item) => item.live_only).map((item) => item.id));
        await refreshCatalog();
      }
      closeUploadForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save LIVE product");
    } finally {
      setUploadBusy(false);
    }
  }

  async function deleteDedicatedProduct(item: LiveCatalogProduct) {
    if (!token || !business?.id || !sessionId) return;
    if (!window.confirm(`Delete "${item.name}" from the LIVE catalog?`)) return;
    setError(null);
    try {
      await api.deleteLiveDedicatedProduct(token, business.id, item.id);
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      await refreshCatalog();
      setSession(await api.getLiveSession(token, business.id, sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete LIVE product");
    }
  }

  async function start() {
    if (!token || !business?.id || !sessionId) return;
    setBusy("start");
    setError(null);
    try {
      setSession(await api.startLiveSession(token, business.id, sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to go live");
    } finally {
      setBusy(null);
    }
  }

  async function end() {
    if (!token || !business?.id || !sessionId) return;
    setBusy("end");
    setError(null);
    try {
      setSession(await api.endLiveSession(token, business.id, sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end LIVE");
    } finally {
      setBusy(null);
    }
  }

  function sendChat() {
    const body = chat.trim();
    if (!body || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    pinChatToBottom.current = true;
    wsRef.current.send(JSON.stringify({ type: "chat.send", body, name: "Host" }));
    setChat("");
  }

  async function addNote() {
    if (!token || !business?.id || !sessionId || !noteContent.trim()) return;
    setNoteBusy(true);
    setError(null);
    try {
      const created = await api.createLiveKnowledge(token, business.id, sessionId, {
        title: noteTitle.trim(),
        content: noteContent.trim(),
      });
      setKnowledge((current) => [...current, created]);
      setNoteTitle("");
      setNoteContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add talking point");
    } finally {
      setNoteBusy(false);
    }
  }

  async function removeNote(entryId: string) {
    if (!token || !business?.id || !sessionId) return;
    setNoteBusy(true);
    setError(null);
    try {
      await api.deleteLiveKnowledge(token, business.id, sessionId, entryId);
      setKnowledge((current) => current.filter((item) => item.id !== entryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete talking point");
    } finally {
      setNoteBusy(false);
    }
  }

  async function copyWatchUrl() {
    if (!watchUrl) return;
    try {
      await navigator.clipboard.writeText(watchUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  if (!session && !error) {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const live = session?.status === "live";
  const ended = session?.status === "ended";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
      <LiveProductFormModal
        open={uploadOpen}
        editing={Boolean(editingId)}
        form={uploadForm}
        saving={uploadBusy}
        isFormValid={uploadFormValid}
        uploadingImage={uploadingImage}
        uploadImageError={uploadImageError}
        onClose={closeUploadForm}
        onSubmit={(event) => void uploadDedicatedProduct(event)}
        onChange={setUploadForm}
        onUploadImage={(file) => void handleUploadImage(file)}
        onClearImage={() => {
          setUploadForm((current) => ({ ...current, image_url: "" }));
          setUploadImageError(null);
        }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">
            <Link href={adminPath(slug, "/add-ons/live")} className="hover:text-slate-700">
              LORESCALE LIVE
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {session?.title ?? "Control Room"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {live
              ? `${session?.viewer_count ?? 0} watching now`
              : ended
                ? "This room has ended"
                : "Not on air yet"}
            {" · "}
            {selectedIds.length === 1 ? "1 product on the show" : `${selectedIds.length} products on the show`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              live
                ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600"
                : ended
                  ? "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500"
                  : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
            }
          >
            {live ? "On air" : ended ? "Ended" : "Draft"}
          </span>
          {live ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy === "end"}
              onClick={() => void end()}
            >
              <StopIcon className="size-4" aria-hidden />
              {busy === "end" ? "Ending…" : "End LIVE"}
            </Button>
          ) : (
            <Button type="button" disabled={busy === "start"} onClick={() => void start()}>
              <PlayIcon className="size-4" aria-hidden />
              {busy === "start" ? "Starting…" : ended ? "Go live again" : "Go live"}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Share with viewers
            </p>
            <p className="mt-1 truncate font-mono text-sm text-slate-800">{watchUrl || "—"}</p>
            <p className="mt-1 text-xs text-slate-500">
              {live
                ? "Anyone with this link can watch and buy."
                : ended
                  ? "This room has ended. Go live again to reopen the same watch link."
                  : "Copy the link now. Viewers can open it after you go live."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void copyWatchUrl()}>
              <ClipboardDocumentIcon className="size-4" aria-hidden />
              {copied ? "Copied" : "Copy link"}
            </Button>
            {live ? (
              <Button asChild>
                <a href={watchUrl} target="_blank" rel="noreferrer">
                  <ArrowTopRightOnSquareIcon className="size-4" aria-hidden />
                  Open watch
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled>
                <ArrowTopRightOnSquareIcon className="size-4" aria-hidden />
                Open after live
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <ControlRoomTabs
          tab={tab}
          onChange={setTab}
          productCount={selectedIds.length}
          unreadChat={unreadChat}
          knowledgeCount={knowledge.length}
          orderCount={liveOrders.length}
        />

        <section
          className={tab === "products" ? "flex min-h-[32rem] flex-col" : "hidden"}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Products on the show</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Dedicated LIVE products only. Tap a card to edit; the checkmark puts it on the show.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {selectedIds.length} selected
              </span>
              <Button type="button" variant="outline" size="sm" onClick={openAddForm}>
                <PlusIcon className="size-3.5" aria-hidden />
                Add product
              </Button>
            </div>
          </div>

          {highlighted ? (
            <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-red-50 px-3 py-2.5 ring-1 ring-red-100">
              {highlighted.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveMediaUrl(highlighted.image_url)}
                  alt=""
                  className="size-10 rounded-lg object-cover"
                />
              ) : (
                <span className="size-10 rounded-lg bg-red-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
                  AI is featuring
                </p>
                <p className="truncate text-sm font-semibold text-slate-900">{highlighted.name}</p>
              </div>
              <p className="text-sm font-semibold text-slate-900">{formatCurrency(highlighted.price)}</p>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {catalog.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                No LIVE products yet.{" "}
                <button
                  type="button"
                  className="font-medium text-red-600 hover:underline"
                  onClick={openAddForm}
                >
                  Add a dedicated product
                </button>{" "}
                to sell on this show.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {catalog.map((item) => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <LiveProductCard
                        product={item}
                        selected={checked}
                        featuring={highlighted?.id === item.id}
                        onToggle={() =>
                          setSelectedIds((current) =>
                            checked
                              ? current.filter((id) => id !== item.id)
                              : [...current, item.id],
                          )
                        }
                        onEdit={() => openEditForm(item)}
                        onDelete={() => void deleteDedicatedProduct(item)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {productsDirty ? "Unsaved changes" : "Showing the latest saved list"}
            </p>
            <Button
              type="button"
              disabled={busy === "save" || !productsDirty || catalog.length === 0}
              onClick={() => void saveProducts()}
            >
              {busy === "save" ? "Saving…" : "Save products"}
            </Button>
          </div>
        </section>

        <section
          className={
            tab === "chat"
              ? "flex h-[min(36rem,calc(100dvh-20rem))] min-h-0 flex-col overflow-hidden"
              : "hidden"
          }
        >
          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Room chat</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              You and viewers. AI replies from talking points in Knowledge.
            </p>
          </div>
          <div
            ref={listRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
            onScroll={() => {
              const el = listRef.current;
              if (!el) return;
              pinChatToBottom.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 px-3 py-12 text-center">
                <ChatBubbleLeftRightIcon className="size-6 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Chat is empty. Say hi when you go live.</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="text-sm leading-relaxed">
                  <span
                    className={
                      message.role === "ai"
                        ? "font-semibold text-red-600"
                        : message.role === "host"
                          ? "font-semibold text-slate-900"
                          : "font-semibold text-slate-600"
                    }
                  >
                    {message.display_name}
                  </span>
                  <span className="ml-2 text-slate-700">{message.body}</span>
                </div>
              ))
            )}
          </div>
          <form
            className="flex shrink-0 gap-2 border-t border-slate-100 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              sendChat();
            }}
          >
            <input
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              value={chat}
              onChange={(event) => setChat(event.target.value)}
              placeholder="Message the room…"
              maxLength={500}
            />
            <Button type="submit" disabled={!chat.trim()}>
              <PaperAirplaneIcon className="size-4" aria-hidden />
              Send
            </Button>
          </form>
        </section>

        <section
          className={
            tab === "knowledge"
              ? "flex h-[min(36rem,calc(100dvh-20rem))] min-h-0 flex-col overflow-hidden"
              : "hidden"
          }
        >
          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">LIVE knowledge</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Talking points for this room only — the AI host uses these notes while people watch.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {knowledge.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-16 text-center">
                <BookOpenIcon className="size-7 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No talking points yet</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                  Add a promo, FAQ, or product hook. Example: “Latte is today&apos;s flash deal — buy 2
                  get 10% off.”
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {knowledge.map((note) => (
                  <li
                    key={note.id}
                    className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 ring-1 ring-slate-200/80"
                  >
                    <div className="min-w-0">
                      {note.title ? (
                        <p className="text-sm font-semibold text-slate-900">{note.title}</p>
                      ) : null}
                      <p className="text-sm text-slate-600">{note.content}</p>
                    </div>
                    <button
                      type="button"
                      disabled={noteBusy}
                      onClick={() => void removeNote(note.id)}
                      className="inline-flex shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-red-600"
                      aria-label="Delete talking point"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="shrink-0 space-y-2 border-t border-slate-100 p-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder="Title (optional)"
              maxLength={160}
            />
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={noteContent}
                onChange={(event) => setNoteContent(event.target.value)}
                placeholder="Talking point the AI should say…"
                maxLength={2000}
              />
              <Button
                type="button"
                disabled={noteBusy || !noteContent.trim()}
                onClick={() => void addNote()}
              >
                <PlusIcon className="size-4" aria-hidden />
                {noteBusy ? "Saving…" : "Add"}
              </Button>
            </div>
          </div>
        </section>

        <section className={tab === "orders" ? "min-h-[32rem]" : "hidden"}>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Orders from this show</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Purchases viewers confirm on the watch page. They stay here after the room ends.
            </p>
          </div>
          <div className="space-y-3 px-4 py-4">
            {liveOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-16 text-center">
                <ShoppingBagIcon className="size-7 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No orders yet</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                  When a viewer buys a LIVE product, the order appears here so you can pack and
                  confirm payment.
                </p>
              </div>
            ) : (
              liveOrders.map((order) => <LiveOrderCard key={order.id} order={order} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
