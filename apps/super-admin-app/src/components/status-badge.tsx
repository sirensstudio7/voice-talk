import { cn } from "@/lib/cn";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "contacted" || status === "approved"
      ? "border-green-100 bg-green-50 text-green-700"
      : status === "pending" || status === "new" || status === "trialing"
        ? "border-sky-100 bg-sky-50 text-sky-700"
      : status === "suspended" ||
          status === "disabled" ||
          status === "cancelled" ||
          status === "closed" ||
          status === "rejected" ||
          status === "expired"
        ? "border-red-100 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        tone,
      )}
    >
      {status}
    </span>
  );
}
