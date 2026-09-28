import { mergeTranscriptMessages } from "@voicetalk/shared";

import type { VoiceSessionDetail } from "@/lib/api";

type ConversationsExportData = {
  businessSlug: string;
  conversations: VoiceSessionDetail[];
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
  return `${businessSlug}-conversations-${range}-${exportedOn}.${extension}`;
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

const END_REASON_LABELS: Record<string, string> = {
  question_answered: "Answered",
  patient_goodbye: "Goodbye",
  out_of_scope: "Out of scope",
  idle_timeout: "Timed out",
  manual: "Ended by patient",
    disconnected: "Disconnected",
    admin: "Ended by staff",
  };

function formatEndReason(reason: string | null) {
  if (!reason) return "";
  return END_REASON_LABELS[reason] ?? reason;
}

function buildConversationSummaryRows(conversations: VoiceSessionDetail[]) {
  return [
    csvRow([
      "Session ID",
      "Started at",
      "Ended at",
      "Status",
      "End reason",
      "Duration (seconds)",
      "Message count",
      "Kiosk display",
      "Order ID",
      "Order total",
    ]),
    ...conversations.map((session) =>
      csvRow([
        session.id,
        session.started_at,
        session.ended_at ?? "",
        session.status,
        formatEndReason(session.end_reason),
        session.duration_seconds ?? "",
        session.message_count,
        session.kiosk_display_name ?? "",
        session.order_id ?? "",
        session.order_total ?? "",
      ]),
    ),
  ];
}

function buildTranscriptRows(conversations: VoiceSessionDetail[]) {
  return [
    csvRow(["Session ID", "Started at", "Sequence", "Role", "Timestamp", "Message"]),
    ...conversations.flatMap((session) => {
      const messages = mergeTranscriptMessages(session.messages);
      return messages.map((message, index) =>
        csvRow([
          session.id,
          session.started_at,
          index + 1,
          message.role,
          message.created_at,
          message.text,
        ]),
      );
    }),
  ];
}

export function exportConversationsCsv({
  businessSlug,
  conversations,
  filterDate,
}: ConversationsExportData) {
  const lines = [
    "Conversations",
    ...buildConversationSummaryRows(conversations),
    "",
    "Transcripts",
    ...buildTranscriptRows(conversations),
  ];

  downloadFile(
    lines.join("\n"),
    exportFilename(businessSlug, filterDate, "csv"),
    "text/csv;charset=utf-8",
  );
}

export function exportConversationsJson({
  businessSlug,
  conversations,
  filterDate,
}: ConversationsExportData) {
  const payload = {
    exported_at: new Date().toISOString(),
    business_slug: businessSlug,
    filter_date: filterDate ?? null,
    conversation_count: conversations.length,
    conversations: conversations.map((session) => ({
      id: session.id,
      status: session.status,
      started_at: session.started_at,
      ended_at: session.ended_at,
      end_reason: session.end_reason,
      duration_seconds: session.duration_seconds,
      message_count: session.message_count,
      kiosk_display_id: session.kiosk_display_id,
      kiosk_display_name: session.kiosk_display_name,
      kiosk_display_slug: session.kiosk_display_slug,
      order_id: session.order_id,
      order_total: session.order_total,
      messages: mergeTranscriptMessages(session.messages).map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        created_at: message.created_at,
      })),
    })),
  };

  downloadFile(
    JSON.stringify(payload, null, 2),
    exportFilename(businessSlug, filterDate, "json"),
    "application/json;charset=utf-8",
  );
}

export function exportConversationsXls({
  businessSlug,
  conversations,
  filterDate,
}: ConversationsExportData) {
  const conversationRows = [
    xmlRow([
      { value: "Session ID" },
      { value: "Started at" },
      { value: "Ended at" },
      { value: "Status" },
      { value: "End reason" },
      { value: "Duration (seconds)" },
      { value: "Message count" },
      { value: "Kiosk display" },
      { value: "Order ID" },
      { value: "Order total" },
    ]),
    ...conversations.map((session) =>
      xmlRow([
        { value: session.id },
        { value: session.started_at },
        { value: session.ended_at ?? "" },
        { value: session.status },
        { value: formatEndReason(session.end_reason) },
        {
          value: session.duration_seconds ?? "",
          type: session.duration_seconds != null ? "Number" : "String",
        },
        { value: session.message_count, type: "Number" },
        { value: session.kiosk_display_name ?? "" },
        { value: session.order_id ?? "" },
        {
          value: session.order_total ?? "",
          type: session.order_total != null ? "Number" : "String",
        },
      ]),
    ),
  ];

  const transcriptRows = [
    xmlRow([
      { value: "Session ID" },
      { value: "Started at" },
      { value: "Sequence" },
      { value: "Role" },
      { value: "Timestamp" },
      { value: "Message" },
    ]),
    ...conversations.flatMap((session) => {
      const messages = mergeTranscriptMessages(session.messages);
      return messages.map((message, index) =>
        xmlRow([
          { value: session.id },
          { value: session.started_at },
          { value: index + 1, type: "Number" },
          { value: message.role },
          { value: message.created_at },
          { value: message.text },
        ]),
      );
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Conversations">
    <Table>${conversationRows.join("")}</Table>
  </Worksheet>
  <Worksheet ss:Name="Transcripts">
    <Table>${transcriptRows.join("")}</Table>
  </Worksheet>
</Workbook>`;

  downloadFile(
    xml,
    exportFilename(businessSlug, filterDate, "xls"),
    "application/vnd.ms-excel",
  );
}
