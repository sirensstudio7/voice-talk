export function effectivePrice(price: number, discountPercent = 0): number {
  if (discountPercent <= 0) return price;
  return Math.round(price * (1 - Math.min(discountPercent, 100) / 100) * 100) / 100;
}

export function serializeUtcDatetime(value: Date): string {
  return value.toISOString().replace("+00:00", "Z");
}
