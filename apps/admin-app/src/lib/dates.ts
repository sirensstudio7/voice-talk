/** Parse API timestamps stored as UTC but often serialized without a timezone suffix. */
export function parseApiDate(iso: string): Date {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(iso)) {
    return new Date(iso);
  }
  return new Date(`${iso}Z`);
}

export function toDateInputValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayDateInputValue() {
  return toDateInputValue(new Date());
}

export function yesterdayDateInputValue() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toDateInputValue(date);
}

export function formatSelectedDateLabel(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function formatShortDateLabel(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatFilterDateLabel(dateStr: string) {
  if (dateStr === todayDateInputValue()) return "Today";
  if (dateStr === yesterdayDateInputValue()) return "Yesterday";
  return formatSelectedDateLabel(dateStr);
}
