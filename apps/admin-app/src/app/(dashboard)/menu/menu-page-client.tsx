"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, Plus, Search, Trash2, Upload, UtensilsCrossed, X } from "lucide-react";

import { PageHeader, StatCard } from "@/components/ui";
import { api, type Product } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CURRENCY_PREFIX, formatCurrency } from "@/lib/currency";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CATEGORY_OPTIONS = ["Coffee", "Pastry", "Food", "Drinks"] as const;

const emptyForm = {
  product_id: "",
  name: "",
  price: "",
  discount_percent: "",
  category: "Coffee",
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
        <p className="text-base font-bold tabular-nums tracking-tight text-orange-600">
          {formatCurrency(salePrice)}
        </p>
        <p className="text-sm tabular-nums text-slate-400 line-through">{formatCurrency(price)}</p>
        <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
          -{discountPercent % 1 === 0 ? discountPercent : discountPercent.toFixed(1)}%
        </span>
      </div>
    );
  }

  return (
    <p className="text-base font-bold tabular-nums tracking-tight text-slate-900">
      {formatCurrency(price)}
    </p>
  );
}

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

function groupByCategory(products: Product[]) {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const existing = groups.get(product.category) ?? [];
    existing.push(product);
    groups.set(product.category, existing);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({
      category,
      items: [...items].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    }));
}

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  const showImage = product.image_url && !imageError;
  const resolvedImageUrl = resolveMediaUrl(product.image_url);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 transition hover:shadow-md active:scale-[0.99]">
      <div className="px-1 pt-1">
        <div className="relative aspect-[7/6] w-full overflow-hidden rounded-xl bg-slate-100">
          {showImage ? (
            <Image
              src={resolvedImageUrl}
              alt={product.name}
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 text-3xl">
              ☕
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/10 to-transparent" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-h-0 flex-1">
          <p className="line-clamp-1 text-base font-semibold leading-tight tracking-tight text-slate-900">
            {product.name}
          </p>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-slate-500">
            {product.description || product.product_id}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
          <ProductPrice price={product.price} discountPercent={product.discount_percent} />
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${product.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${product.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

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

const inputClassName =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500";

function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    if (CATEGORY_OPTIONS.includes(value as (typeof CATEGORY_OPTIONS)[number])) {
      return [...CATEGORY_OPTIONS];
    }
    return [value, ...CATEGORY_OPTIONS];
  }, [value]);

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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5 text-left text-sm shadow-sm transition-colors ${
          open
            ? "border-orange-300 ring-2 ring-orange-500/20"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <span className="font-medium text-slate-900">{value}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute z-20 mt-1.5 max-h-48 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/80"
        >
          {options.map((option) => {
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
                      ? "bg-orange-50 font-medium text-orange-700"
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
      id="product-image"
      label="Product image"
      hint="Upload a photo or paste an image URL — shown in the customer menu."
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
              <Upload className="h-3.5 w-3.5" />
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
          <Upload className="h-6 w-6 text-slate-400" />
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
        id="product-image-url"
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

function ProductFormModal({
  open,
  editingId,
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
  editingId: string | null;
  form: typeof emptyForm;
  saving: boolean;
  isFormValid: boolean;
  uploadingImage: boolean;
  uploadImageError: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (form: typeof emptyForm) => void;
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="relative z-10 flex max-h-[min(90vh,800px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="product-form-title" className="text-base font-semibold text-slate-900">
              {editingId ? "Edit product" : "Add product"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {editingId
                ? "Update details Eva uses when selling this item."
                : "A new item Eva can recommend and add to orders."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <FormField id="product-name" label="Name" hint="Display name shown to customers.">
              <input
                id="product-name"
                className={inputClassName}
                placeholder="Latte"
                value={form.name}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="product-id" label="Product ID" hint="Used by Eva's tools.">
                <input
                  id="product-id"
                  className={`${inputClassName} font-mono`}
                  placeholder="latte"
                  value={form.product_id}
                  onChange={(event) => onChange({ ...form, product_id: event.target.value })}
                />
              </FormField>

              <FormField id="product-price" label="Price">
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">
                    {CURRENCY_PREFIX}
                  </span>
                  <input
                    id="product-price"
                    type="number"
                    min="0"
                    step="1"
                    className={`${inputClassName} pl-9 tabular-nums`}
                    placeholder="45000"
                    value={form.price}
                    onChange={(event) => onChange({ ...form, price: event.target.value })}
                  />
                </div>
              </FormField>
            </div>

            <FormField
              id="product-discount"
              label="Discount"
              hint="Optional percentage off the list price. Leave at 0 for no discount."
            >
              <div className="relative">
                <input
                  id="product-discount"
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
              {form.price &&
              form.discount_percent &&
              !Number.isNaN(Number(form.price)) &&
              !Number.isNaN(Number(form.discount_percent)) &&
              Number(form.discount_percent) > 0 ? (
                <p className="mt-1.5 text-xs text-orange-600">
                  Sale price: {formatCurrency(effectivePrice(Number(form.price), Number(form.discount_percent)))}
                </p>
              ) : null}
            </FormField>

            <FormField id="product-category" label="Category">
              <CategorySelect
                id="product-category"
                value={form.category}
                onChange={(category) => onChange({ ...form, category })}
              />
            </FormField>

            <FormField id="product-description" label="Description">
              <textarea
                id="product-description"
                className={`${inputClassName} min-h-20 resize-y`}
                placeholder="Espresso with steamed milk."
                value={form.description}
                onChange={(event) => onChange({ ...form, description: event.target.value })}
              />
            </FormField>

            <ProductImageField
              imageUrl={form.image_url}
              name={form.name}
              uploading={uploadingImage}
              uploadError={uploadImageError}
              onUpload={onUploadImage}
              onChangeUrl={(image_url) => onChange({ ...form, image_url })}
              onClear={onClearImage}
            />
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
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editingId ? (
                <>
                  <Pencil className="h-4 w-4" />
                  {saving ? "Saving…" : "Save changes"}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {saving ? "Adding…" : "Add product"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MenuPageClient() {
  const { token, business } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadImageError, setUploadImageError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const load = async () => {
    if (!token || !business) return;
    setLoading(true);
    try {
      setProducts(await api.listProducts(token, business.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token, business]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort(),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (filterCategory && product.category !== filterCategory) return false;
      if (!query) return true;
      return (
        product.name.toLowerCase().includes(query) ||
        product.product_id.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query)
      );
    });
  }, [products, search, filterCategory]);

  const groups = useMemo(() => groupByCategory(filteredProducts), [filteredProducts]);

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
    setUploadImageError(null);
  };

  const openAddForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setUploadImageError(null);
    setFormOpen(true);
  };

  const handleUploadImage = async (file: File) => {
    if (!token || !business) return;

    setUploadingImage(true);
    setUploadImageError(null);
    try {
      const result = await api.uploadProductImage(token, business.id, file);
      setForm((current) => ({ ...current, image_url: result.image_url }));
    } catch (err) {
      setUploadImageError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingImage(false);
    }
  };

  const isFormValid =
    form.product_id.trim().length > 0 &&
    form.name.trim().length > 0 &&
    form.price.trim().length > 0 &&
    !Number.isNaN(Number(form.price)) &&
    Number(form.price) >= 0 &&
    (form.discount_percent.trim().length === 0 ||
      (!Number.isNaN(Number(form.discount_percent)) &&
        Number(form.discount_percent) >= 0 &&
        Number(form.discount_percent) <= 100));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !business || !isFormValid) return;

    setSaving(true);
    try {
      const payload = {
        product_id: form.product_id.trim(),
        name: form.name.trim(),
        price: Number(form.price),
        discount_percent:
          form.discount_percent.trim().length > 0 ? Number(form.discount_percent) : 0,
        category: form.category.trim() || "Coffee",
        description: form.description.trim(),
        image_url: form.image_url.trim(),
      };

      if (editingId) {
        await api.updateProduct(token, business.id, editingId, payload);
      } else {
        await api.createProduct(token, business.id, payload);
      }

      closeForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      product_id: product.product_id,
      name: product.name,
      price: String(product.price),
      discount_percent: product.discount_percent > 0 ? String(product.discount_percent) : "",
      category: product.category,
      description: product.description,
      image_url: product.image_url,
    });
    setFormOpen(true);
  };

  const handleDelete = async (product: Product) => {
    if (!token || !business) return;
    if (
      !window.confirm(
        `Delete "${product.name}"? Eva will no longer be able to sell this product.`,
      )
    ) {
      return;
    }
    await api.deleteProduct(token, business.id, product.id);
    if (editingId === product.id) closeForm();
    await load();
  };

  const subtitle = useMemo(() => {
    if (loading) return "Loading menu…";
    if (products.length === 0) return "Add products Eva can recommend and sell to customers.";
    const categoryLabel =
      categories.length === 1 ? "1 category" : `${categories.length} categories`;
    return `${products.length} ${products.length === 1 ? "product" : "products"} across ${categoryLabel}`;
  }, [loading, products.length, categories.length]);

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle={subtitle}
        action={
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Add product
          </button>
        }
      />

      <ProductFormModal
        open={formOpen}
        editingId={editingId}
        form={form}
        saving={saving}
        isFormValid={isFormValid}
        uploadingImage={uploadingImage}
        uploadImageError={uploadImageError}
        onClose={closeForm}
        onSubmit={handleSubmit}
        onChange={setForm}
        onUploadImage={(file) => {
          void handleUploadImage(file);
        }}
        onClearImage={() => setForm((current) => ({ ...current, image_url: "" }))}
      />

      {products.length > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StatCard label="Total products" value={String(products.length)} />
          <StatCard label="Categories" value={String(categories.length)} />
        </div>
      ) : null}

      <section>
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                <div
                  key={index}
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
                      <div className="flex gap-1.5">
                        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
                        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                <UtensilsCrossed className="h-7 w-7" />
              </div>
              <p className="text-lg font-semibold text-slate-900">No products yet</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                Add your coffee, food, and drinks here. Eva uses this menu to answer questions and
                build customer orders.
              </p>
              <button
                type="button"
                onClick={openAddForm}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                <Plus className="h-4 w-4" />
                Add product
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 p-5">
              <div className="relative mb-6 w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                />
              </div>

              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center">
                  <p className="text-base font-semibold text-slate-900">No matching products</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Try a different search term or clear your filters.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setFilterCategory(null);
                    }}
                    className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
              <div className="flex flex-col gap-6">
              {categories.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterCategory(null)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      filterCategory === null
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-100"
                    }`}
                  >
                    All
                  </button>
                  {categories.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilterCategory(item === filterCategory ? null : item)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        filterCategory === item
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-100"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}

              {groups.map((group) => (
                <section key={group.category}>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {group.category}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.items.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onEdit={() => handleEdit(product)}
                        onDelete={() => {
                          void handleDelete(product);
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
              </div>
              )}
            </div>
          )}
      </section>
    </>
  );
}
