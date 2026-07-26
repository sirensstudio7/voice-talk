import type { Order } from "@/lib/api";

type OrdersExportData = {
  businessSlug: string;
  orders: Order[];
  filterDate?: string | null;
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

function exportFilename(businessSlug: string, filterDate: string | null | undefined, extension: string) {
  const exportedOn = new Date().toISOString().slice(0, 10);
  const range = filterDate ?? "all";
  return `${businessSlug}-orders-${range}-${exportedOn}.${extension}`;
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

function formatItemsSummary(items: Order["items"]) {
  return items
    .map((item) => (item.quantity > 1 ? `${item.name} x ${item.quantity}` : item.name))
    .join("; ");
}

function buildOrderSummaryRows(orders: Order[]) {
  return [
    csvRow(["Order ID", "Created at", "Customer", "Status", "Total", "Items"]),
    ...orders.map((order) =>
      csvRow([
        order.id,
        order.created_at,
        order.customer_name?.trim() || "",
        order.status,
        order.total,
        formatItemsSummary(order.items),
      ]),
    ),
  ];
}

function buildLineItemRows(orders: Order[]) {
  return [
    csvRow(["Order ID", "Product", "Quantity", "Unit price", "Subtotal"]),
    ...orders.flatMap((order) =>
      order.items.map((item) =>
        csvRow([order.id, item.name, item.quantity, item.price, item.subtotal]),
      ),
    ),
  ];
}

export function exportOrdersCsv({ businessSlug, orders, filterDate }: OrdersExportData) {
  const lines = ["Orders", ...buildOrderSummaryRows(orders), "", "Line items", ...buildLineItemRows(orders)];
  downloadFile(
    lines.join("\n"),
    exportFilename(businessSlug, filterDate, "csv"),
    "text/csv;charset=utf-8",
  );
}

export function exportOrdersXls({ businessSlug, orders, filterDate }: OrdersExportData) {
  const orderRows = [
    xmlRow([
      { value: "Order ID" },
      { value: "Created at" },
      { value: "Customer" },
      { value: "Status" },
      { value: "Total" },
      { value: "Items" },
    ]),
    ...orders.map((order) =>
      xmlRow([
        { value: order.id },
        { value: order.created_at },
        { value: order.customer_name?.trim() || "" },
        { value: order.status },
        { value: order.total, type: "Number" },
        { value: formatItemsSummary(order.items) },
      ]),
    ),
  ];

  const lineItemRows = [
    xmlRow([
      { value: "Order ID" },
      { value: "Product" },
      { value: "Quantity" },
      { value: "Unit price" },
      { value: "Subtotal" },
    ]),
    ...orders.flatMap((order) =>
      order.items.map((item) =>
        xmlRow([
          { value: order.id },
          { value: item.name },
          { value: item.quantity, type: "Number" },
          { value: item.price, type: "Number" },
          { value: item.subtotal, type: "Number" },
        ]),
      ),
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Orders">
    <Table>${orderRows.join("")}</Table>
  </Worksheet>
  <Worksheet ss:Name="Line items">
    <Table>${lineItemRows.join("")}</Table>
  </Worksheet>
</Workbook>`;

  downloadFile(xml, exportFilename(businessSlug, filterDate, "xls"), "application/vnd.ms-excel");
}
