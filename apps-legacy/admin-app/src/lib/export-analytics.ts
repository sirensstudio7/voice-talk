import type { StatsDailyPoint, TopProductStat } from "@/lib/api";

type AnalyticsExportData = {
  businessSlug: string;
  daily: StatsDailyPoint[];
  topProducts: TopProductStat[];
};

function downloadFile(content: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportFilename(businessSlug: string, extension: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `${businessSlug}-analytics-${date}.${extension}`;
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

function buildDailyRows(daily: StatsDailyPoint[]) {
  return [
    csvRow(["Date", "Orders", "Revenue"]),
    ...daily.map((point) => csvRow([point.date, point.orders, point.revenue])),
  ];
}

function buildTopProductRows(topProducts: TopProductStat[]) {
  return [
    csvRow(["Rank", "Product", "Quantity sold", "Revenue"]),
    ...topProducts.map((product, index) =>
      csvRow([index + 1, product.name, product.quantity, product.revenue]),
    ),
  ];
}

export function exportAnalyticsCsv({ businessSlug, daily, topProducts }: AnalyticsExportData) {
  const lines = [
    "Daily orders (last 14 days)",
    ...buildDailyRows(daily),
    "",
    "Top products",
    ...buildTopProductRows(topProducts),
  ];

  downloadFile(lines.join("\n"), exportFilename(businessSlug, "csv"), "text/csv;charset=utf-8");
}

export function exportAnalyticsXls({ businessSlug, daily, topProducts }: AnalyticsExportData) {
  const dailyRows = [
    xmlRow([
      { value: "Date" },
      { value: "Orders" },
      { value: "Revenue" },
    ]),
    ...daily.map((point) =>
      xmlRow([
        { value: point.date },
        { value: point.orders, type: "Number" },
        { value: point.revenue, type: "Number" },
      ]),
    ),
  ];

  const productRows = [
    xmlRow([
      { value: "Rank" },
      { value: "Product" },
      { value: "Quantity sold" },
      { value: "Revenue" },
    ]),
    ...topProducts.map((product, index) =>
      xmlRow([
        { value: index + 1, type: "Number" },
        { value: product.name },
        { value: product.quantity, type: "Number" },
        { value: product.revenue, type: "Number" },
      ]),
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Daily orders">
    <Table>${dailyRows.join("")}</Table>
  </Worksheet>
  <Worksheet ss:Name="Top products">
    <Table>${productRows.join("")}</Table>
  </Worksheet>
</Workbook>`;

  downloadFile(xml, exportFilename(businessSlug, "xls"), "application/vnd.ms-excel");
}
