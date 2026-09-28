import type { Appointment } from "@/lib/api";
import { parseApiDate } from "@/lib/dates";

type BookingsExportData = {
  businessSlug: string;
  appointments: Appointment[];
  filterDate?: string | null;
};

function downloadFile(content: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFilename(
  businessSlug: string,
  filterDate: string | null | undefined,
  extension: string,
) {
  const exportedOn = new Date().toISOString().slice(0, 10);
  const range = filterDate ?? "all";
  return `${businessSlug}-bookings-${range}-${exportedOn}.${extension}`;
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(values: Array<string | number>) {
  return values.map(escapeCsvCell).join(",");
}

function xmlCell(value: string | number, type: "String" | "Number" = "String") {
  const escaped = String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<Cell><Data ss:Type="${type}">${escaped}</Data></Cell>`;
}

function xmlRow(values: Array<{ value: string | number; type?: "String" | "Number" }>) {
  return `<Row>${values.map(({ value, type }) => xmlCell(value, type ?? "String")).join("")}</Row>`;
}

function formatDate(iso: string) {
  return parseApiDate(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return parseApiDate(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBookedAt(iso: string) {
  return parseApiDate(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const HEADERS = [
  "Date",
  "Start",
  "End",
  "Customer",
  "Phone",
  "Doctor",
  "Service",
  "Status",
  "Booked at",
] as const;

function rowValues(appointment: Appointment): Array<string | number> {
  return [
    formatDate(appointment.starts_at),
    formatTime(appointment.starts_at),
    formatTime(appointment.ends_at),
    appointment.customer_name,
    appointment.customer_phone || "",
    appointment.staff_name || "",
    appointment.treatment_name,
    appointment.status,
    formatBookedAt(appointment.created_at),
  ];
}

export function exportBookingsCsv({
  businessSlug,
  appointments,
  filterDate,
}: BookingsExportData) {
  const lines = [csvRow([...HEADERS]), ...appointments.map((item) => csvRow(rowValues(item)))];
  downloadFile(
    `\uFEFF${lines.join("\n")}`,
    exportFilename(businessSlug, filterDate, "csv"),
    "text/csv;charset=utf-8",
  );
}

export function exportBookingsXls({
  businessSlug,
  appointments,
  filterDate,
}: BookingsExportData) {
  const rows = [
    xmlRow(HEADERS.map((value) => ({ value }))),
    ...appointments.map((item) => xmlRow(rowValues(item).map((value) => ({ value })))),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Bookings">
    <Table>${rows.join("")}</Table>
  </Worksheet>
</Workbook>`;
  downloadFile(xml, exportFilename(businessSlug, filterDate, "xls"), "application/vnd.ms-excel");
}
