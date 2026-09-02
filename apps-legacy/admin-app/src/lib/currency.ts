export const CURRENCY_PREFIX = "Rp";

export function formatCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${CURRENCY_PREFIX}${value.toLocaleString("id-ID")}`;
}
