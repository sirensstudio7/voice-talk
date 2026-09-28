export function effectivePrice(price: number, discountPercent = 0): number {
  if (discountPercent <= 0) return price;
  return Math.round(price * (1 - Math.min(discountPercent, 100) / 100));
}

export function formatIdr(amount: number): string {
  return `Rp ${Math.round(Number(amount) || 0).toLocaleString("id-ID")}`;
}

export function formatOrderReadBack(order: Record<string, unknown> | null | undefined): string {
  const items = (order?.items as Array<Record<string, unknown>>) ?? [];
  if (!items.length) return "";
  const lines = items.map((item) => {
    const qty = Number(item.quantity ?? 1);
    const name = String(item.name ?? "").trim();
    const unit = Number(item.price ?? 0);
    const sub = Number(item.subtotal ?? unit * qty);
    return `${qty}x ${name} ${formatIdr(sub)}`;
  });
  return `${lines.join(". ")}. Total ${formatIdr(Number(order?.total ?? 0))}.`;
}

export function serializeUtcDatetime(value: Date): string {
  return value.toISOString().replace("+00:00", "Z");
}
