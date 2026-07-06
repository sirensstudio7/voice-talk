const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const CURRENCY_PREFIX = "Rp";

export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return idrFormatter.format(0);
  return idrFormatter.format(amount);
}
