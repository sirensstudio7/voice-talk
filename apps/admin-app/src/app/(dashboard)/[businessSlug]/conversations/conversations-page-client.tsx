"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeBracketIcon,
  CpuChipIcon,
  StopIcon,
  TableCellsIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { mergeTranscriptMessages } from "@voicetalk/shared";

import { DatePicker } from "@/components/date-picker";
import { PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  api,
  type KioskDisplay,
  type TranscriptMessage,
  type VoiceSession,
  type VoiceSessionDetail,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseApiDate, todayDateInputValue } from "@/lib/dates";
import { formatCurrency } from "@/lib/currency";
import {
  exportConversationsCsv,
  exportConversationsJson,
  exportConversationsXls,
} from "@/lib/export-conversations";

function formatTimestamp(iso: string) {
  const date = parseApiDate(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return `Today · ${time}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday · ${time}`;
  }

  const dayDate = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${dayDate} · ${time}`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "In progress";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/** Gemini 3.1 Flash Live paid audio in+out (~$0.005 + $0.018 / min). */
const GEMINI_LIVE_USD_PER_MINUTE = 0.023;
const STALE_ACTIVE_MS = 15 * 60 * 1000;

function isStaleActive(session: VoiceSession) {
  if (session.status !== "active" || session.ended_at) return false;
  return Date.now() - parseApiDate(session.started_at).getTime() > STALE_ACTIVE_MS;
}

function sessionDurationSeconds(session: VoiceSession): number | null {
  if (session.duration_seconds != null) return Math.max(0, session.duration_seconds);
  if (session.status === "active" && !isStaleActive(session)) {
    return Math.max(
      0,
      Math.floor((Date.now() - parseApiDate(session.started_at).getTime()) / 1000),
    );
  }
  return null;
}

function formatEstimatedAiCost(seconds: number | null): string {
  if (seconds == null) return "—";
  const usd = (seconds / 60) * GEMINI_LIVE_USD_PER_MINUTE;
  if (usd < 0.01) return "< $0.01";
  return `~$${usd.toFixed(2)}`;
}

function formatSelectedDateLabel(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatDateLabel(iso: string) {
  const date = parseApiDate(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function groupSessionsByDate(sessions: VoiceSession[]) {
  const sorted = [...sessions].sort(
    (a, b) => parseApiDate(b.started_at).getTime() - parseApiDate(a.started_at).getTime(),
  );

  const groups = new Map<string, VoiceSession[]>();
  for (const session of sorted) {
    const key = parseApiDate(session.started_at).toDateString();
    const existing = groups.get(key) ?? [];
    existing.push(session);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([, groupSessions]) => ({
    label: formatDateLabel(groupSessions[0].started_at),
    sessions: groupSessions,
  }));
}

function filterPillClass(active: boolean) {
  return [
    "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-slate-900 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

type OrderFilter = "all" | "with_order" | "no_order";
type StatusFilter = "all" | "active" | "ended" | "interrupted";

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "active", label: "Active" },
  { id: "ended", label: "Ended" },
  { id: "interrupted", label: "Interrupted" },
];

function FilterCheck({ selected }: { selected: boolean }) {
  return (
    <CheckIcon
      className={`ml-auto size-4 text-orange-500 ${selected ? "opacity-100" : "opacity-0"}`}
    />
  );
}

function matchesOrderFilter(session: VoiceSession, filter: OrderFilter) {
  if (filter === "with_order") return Boolean(session.order_id);
  if (filter === "no_order") return !session.order_id;
  return true;
}

function orderFilterLabel(filter: OrderFilter) {
  if (filter === "with_order") return "with order";
  if (filter === "no_order") return "without order";
  return "";
}

function sessionDisplayStatus(session: VoiceSession): Exclude<StatusFilter, "all"> {
  if (isStaleActive(session)) return "interrupted";
  if (session.status === "active" && !session.ended_at) return "active";
  return "ended";
}

function matchesStatusFilter(session: VoiceSession, filter: StatusFilter) {
  if (filter === "all") return true;
  return sessionDisplayStatus(session) === filter;
}

function statusFilterLabel(filter: StatusFilter) {
  if (filter === "active") return "active";
  if (filter === "ended") return "ended";
  if (filter === "interrupted") return "interrupted";
  return "";
}

function StatusBadge({
  status,
  title,
}: {
  status: string;
  title?: string;
}) {
  const styles: Record<string, string> = {
    ended: "bg-slate-100 text-slate-600 ring-slate-500/10",
    active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    interrupted: "bg-amber-50 text-amber-800 ring-amber-600/20",
  };
  const labels: Record<string, string> = {
    interrupted: "Interrupted",
  };

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${
        styles[status.toLowerCase()] ?? "bg-slate-100 text-slate-600 ring-slate-500/10"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function EndReasonBadge({ reason }: { reason: string | null }) {
  if (!reason) return null;

  const labels: Record<string, string> = {
    question_answered: "Answered",
    patient_goodbye: "Goodbye",
    out_of_scope: "Out of scope",
    idle_timeout: "Timed out",
    manual: "Ended by patient",
    disconnected: "Disconnected",
    admin: "Ended by staff",
  };

  const styles: Record<string, string> = {
    question_answered: "bg-blue-50 text-blue-700",
    patient_goodbye: "bg-violet-50 text-violet-700",
    out_of_scope: "bg-amber-50 text-amber-700",
    idle_timeout: "bg-orange-50 text-orange-700",
    manual: "bg-slate-100 text-slate-600",
    disconnected: "bg-slate-100 text-slate-600",
    admin: "bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        styles[reason] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {labels[reason] ?? reason}
    </span>
  );
}

function TranscriptBubble({ message }: { message: TranscriptMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-orange-100 text-orange-600" : "bg-slate-200 text-slate-600"
        }`}
      >
        {isUser ? <UserIcon className="h-3.5 w-3.5" /> : <CpuChipIcon className="h-3.5 w-3.5" />}
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "rounded-tr-sm bg-orange-500 text-white"
            : "rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-200"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

function canEndConversation(session: VoiceSession) {
  return session.status === "active" && !session.ended_at;
}

function ConversationRow({
  session,
  expanded,
  detail,
  loadingDetail,
  ending,
  showKioskLabel,
  onToggle,
  onEnd,
}: {
  session: VoiceSession;
  expanded: boolean;
  detail: VoiceSessionDetail | null;
  loadingDetail: boolean;
  ending: boolean;
  showKioskLabel: boolean;
  onToggle: () => void;
  onEnd: () => void;
}) {
  const messages = useMemo(
    () => (detail ? mergeTranscriptMessages(detail.messages) : []),
    [detail],
  );
  const stale = isStaleActive(session);
  const displayStatus = sessionDisplayStatus(session);
  const durationSeconds = sessionDurationSeconds(session);
  const estimatedAiCost = formatEstimatedAiCost(durationSeconds);
  const showEnd = canEndConversation(session);

  return (
    <article
      className={`rounded-xl border bg-white transition-all ${
        expanded
          ? "border-slate-300 ring-1 ring-slate-200/80"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-start">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 px-4 py-4 text-left sm:px-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                  {formatTimestamp(session.started_at)}
                </span>
                <StatusBadge
                  status={displayStatus}
                  title={
                    displayStatus === "interrupted"
                      ? "This session never closed (tab closed or server restart). Nobody is talking now."
                      : undefined
                  }
                />
                {session.status === "ended" ? (
                  <EndReasonBadge reason={session.end_reason} />
                ) : null}
                {showKioskLabel && session.kiosk_display_name ? (
                  <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-600/15">
                    {session.kiosk_display_name}
                  </span>
                ) : null}
                <span className="text-xs text-slate-500">
                  {stale ? "Never closed" : formatDuration(session.duration_seconds)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {session.message_count} {session.message_count === 1 ? "message" : "messages"}
                </span>
                {session.order_id ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    Order {session.order_total != null ? formatCurrency(session.order_total) : "—"}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
                    No order
                  </span>
                )}
                <span
                  title="Estimated Gemini Live cost from session length. Not the billed amount."
                  className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
                >
                  Est. AI {estimatedAiCost}
                </span>
              </div>
            </div>

            <ChevronDownIcon
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </button>

        {showEnd ? (
          <div className="shrink-0 py-4 pr-4 sm:pr-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ending}
              className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              onClick={onEnd}
            >
              <StopIcon className="size-3.5" aria-hidden />
              {ending ? "Ending…" : "End"}
            </Button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
          {loadingDetail ? (
            <p className="text-sm text-slate-500">Loading transcript…</p>
          ) : detail && messages.length > 0 ? (
            <div className="space-y-3">
              {messages.map((message) => (
                <TranscriptBubble key={message.id} message={message} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No transcript recorded for this session. Transcripts are saved for new conversations
              going forward.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function ConversationsPageClient() {
  const { token, business } = useAuth();
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VoiceSessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kioskDisplays, setKioskDisplays] = useState<KioskDisplay[]>([]);
  const [kioskFilter, setKioskFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const endingIdRef = useRef<string | null>(null);

  const showKioskFilter = kioskDisplays.length > 1;
  const kioskDisplayIdForApi =
    showKioskFilter && kioskFilter !== "all" ? kioskFilter : undefined;

  useEffect(() => {
    if (!token || !business) return;
    void api
      .listKiosks(token, business.id)
      .then((res) => setKioskDisplays(res.items))
      .catch(() => setKioskDisplays([]));
  }, [token, business]);

  useEffect(() => {
    if (kioskFilter === "all") return;
    if (!kioskDisplays.some((display) => display.id === kioskFilter)) {
      setKioskFilter("all");
    }
  }, [kioskDisplays, kioskFilter]);

  useEffect(() => {
    if (!token || !business) return;

    let cancelled = false;
    let inFlight = false;

    const load = async (isInitial: boolean) => {
      if (inFlight) return;
      inFlight = true;
      if (isInitial) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }
      setLoadError(null);
      try {
        const data = await api.listConversations(token, business.id, {
          date: selectedDate ?? undefined,
          kioskDisplayId: kioskDisplayIdForApi,
        });
        if (!cancelled && !endingIdRef.current) setSessions(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load conversations.");
        }
      } finally {
        inFlight = false;
        if (!cancelled) {
          if (isInitial) {
            setInitialLoading(false);
          } else {
            setRefreshing(false);
          }
        }
      }
    };

    void load(true);
    const interval = window.setInterval(() => void load(false), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, business, selectedDate, kioskDisplayIdForApi]);

  useEffect(() => {
    if (!token || !business || !expandedId) {
      setDetail(null);
      return;
    }

    setLoadingDetail(true);
    void api
      .getConversation(token, business.id, expandedId)
      .then(setDetail)
      .finally(() => setLoadingDetail(false));
  }, [token, business, expandedId]);

  const filteredSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          matchesOrderFilter(session, orderFilter) && matchesStatusFilter(session, statusFilter),
      ),
    [sessions, orderFilter, statusFilter],
  );

  useEffect(() => {
    if (expandedId && !filteredSessions.some((session) => session.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, filteredSessions]);

  const groups = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions]);

  const stats = useMemo(() => {
    const ended = filteredSessions.filter((s) => s.duration_seconds !== null);
    const avgDuration =
      ended.length > 0
        ? ended.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) / ended.length
        : null;
    const withOrder = filteredSessions.filter((s) => s.order_id).length;
    const usageSeconds = filteredSessions.reduce(
      (sum, session) => sum + (sessionDurationSeconds(session) ?? 0),
      0,
    );
    return {
      count: filteredSessions.length,
      avgDuration,
      withOrder,
      usageCost: formatEstimatedAiCost(usageSeconds > 0 ? usageSeconds : null),
    };
  }, [filteredSessions]);

  const selectedKioskName = useMemo(() => {
    if (kioskFilter === "all") return null;
    return kioskDisplays.find((display) => display.id === kioskFilter)?.name ?? null;
  }, [kioskDisplays, kioskFilter]);

  const subtitle = useMemo(() => {
    const filterNotes = [
      selectedKioskName ? selectedKioskName : "",
      orderFilter !== "all" ? orderFilterLabel(orderFilter) : "",
      statusFilter !== "all" ? statusFilterLabel(statusFilter) : "",
    ].filter(Boolean);
    const filterNote = filterNotes.length > 0 ? ` · ${filterNotes.join(" · ")} only` : "";

    if (filteredSessions.length === 0) {
      if (
        sessions.length > 0 &&
        (orderFilter !== "all" || statusFilter !== "all" || Boolean(selectedKioskName))
      ) {
        return "No conversations match this view.";
      }
      return selectedDate
        ? `No conversations on ${formatSelectedDateLabel(selectedDate)}.`
        : "Customer–AI voice conversation history and transcripts.";
    }

    const countLabel = `${filteredSessions.length} ${filteredSessions.length === 1 ? "conversation" : "conversations"}`;
    const cappedNote = !selectedDate && sessions.length >= 200 ? " · showing latest 200" : "";
    if (selectedDate) {
      return `${countLabel} on ${formatSelectedDateLabel(selectedDate)}${filterNote}${cappedNote} · refreshes every 10s`;
    }
    return `${countLabel}${filterNote}${cappedNote} · refreshes every 10s`;
  }, [
    filteredSessions.length,
    sessions.length,
    selectedDate,
    orderFilter,
    statusFilter,
    selectedKioskName,
  ]);

  const exportData = business
    ? {
        businessSlug: business.slug,
        filterDate: selectedDate,
      }
    : null;

  const fetchConversationDetails = async () => {
    if (!token || !business || filteredSessions.length === 0) return [];

    const exportedIds = new Set(filteredSessions.map((session) => session.id));
    const allDetails = await api.exportConversations(token, business.id, {
      date: selectedDate ?? undefined,
      kioskDisplayId: kioskDisplayIdForApi,
    });
    return allDetails.filter((session) => exportedIds.has(session.id));
  };

  const handleExport = async (format: "csv" | "xls" | "json") => {
    if (!exportData) return;

    setExporting(true);
    setExportError(null);
    try {
      const conversations = await fetchConversationDetails();
      if (format === "csv") {
        exportConversationsCsv({ ...exportData, conversations });
      } else if (format === "json") {
        exportConversationsJson({ ...exportData, conversations });
      } else {
        exportConversationsXls({ ...exportData, conversations });
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleEndConversation = async (session: VoiceSession) => {
    if (!token || !business || endingIdRef.current) return;

    endingIdRef.current = session.id;
    setEndingId(session.id);
    setEndError(null);
    try {
      const updated = await api.endConversation(token, business.id, session.id);
      setSessions((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setEndError(err instanceof Error ? err.message : "Failed to end conversation.");
    } finally {
      endingIdRef.current = null;
      setEndingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Conversations"
        subtitle={subtitle}
        titleAction={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!exportData || filteredSessions.length === 0 || exporting}
              >
                <ArrowDownTrayIcon />
                {exporting ? "Exporting…" : "Export"}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void handleExport("csv")}>
                <TableCellsIcon />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport("xls")}>
                <TableCellsIcon />
                Export Excel (.xls)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport("json")}>
                <CodeBracketIcon />
                Export JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {exportError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {exportError}
        </div>
      ) : null}

      {endError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {endError}
        </div>
      ) : null}

      {initialLoading && sessions.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : null}

      {!initialLoading && filteredSessions.length > 0 ? (
        <div className="mb-6 grid gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total conversations" value={String(stats.count)} />
          <StatCard
            label="Avg call duration"
            value={stats.avgDuration !== null ? formatDuration(Math.round(stats.avgDuration)) : "—"}
          />
          <StatCard label="With order" value={String(stats.withOrder)} />
          <StatCard label="Est. AI usage" value={stats.usageCost} />
        </div>
      ) : null}

      {!initialLoading ? (
        <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter by order"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1"
            >
              <button
                type="button"
                onClick={() => setOrderFilter("all")}
                className={filterPillClass(orderFilter === "all")}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter("with_order")}
                className={filterPillClass(orderFilter === "with_order")}
              >
                Order
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter("no_order")}
                className={filterPillClass(orderFilter === "no_order")}
              >
                No order
              </button>
            </div>
            {showKioskFilter ? (
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                <span className="sr-only">Filter by kiosk display</span>
                <select
                  value={kioskFilter}
                  onChange={(event) => setKioskFilter(event.target.value)}
                  className="max-w-[12rem] truncate bg-transparent text-sm font-medium text-slate-800 outline-none"
                >
                  <option value="all">All displays</option>
                  {kioskDisplays.map((display) => (
                    <option key={display.id} value={display.id}>
                      {display.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div
            role="group"
            aria-label="Filter by status and date"
            className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="conversations-status-filter"
                  variant="ghost"
                  className="h-8 w-auto justify-between gap-2 px-3 font-normal hover:bg-slate-100"
                  aria-label="Filter by status"
                >
                  {STATUS_FILTERS.find((item) => item.id === statusFilter)?.label ?? "All statuses"}
                  <ChevronDownIcon className="opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {STATUS_FILTERS.map((item) => (
                  <DropdownMenuItem key={item.id} onSelect={() => setStatusFilter(item.id)}>
                    {item.label}
                    <FilterCheck selected={statusFilter === item.id} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DatePicker
              id="conversations-date-filter"
              value={selectedDate}
              onChange={setSelectedDate}
              maxDate={todayDateInputValue()}
              className="h-8 border-0 bg-transparent px-3 shadow-none hover:bg-slate-100"
            />
            {selectedDate ? (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                All dates
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!initialLoading && filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <ChatBubbleLeftRightIcon className="h-7 w-7" />
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {sessions.length > 0 && (orderFilter !== "all" || statusFilter !== "all")
              ? statusFilter !== "all" && orderFilter === "all"
                ? `No ${statusFilterLabel(statusFilter)} conversations`
                : orderFilter !== "all" && statusFilter === "all"
                  ? orderFilter === "with_order"
                    ? "No conversations with an order"
                    : "No conversations without an order"
                  : "No conversations match these filters"
              : selectedKioskName && !selectedDate
                ? `No conversations on ${selectedKioskName}`
                : selectedDate
                  ? "No conversations on this date"
                  : "No conversations yet"}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            {sessions.length > 0 && (orderFilter !== "all" || statusFilter !== "all")
              ? "Try switching a filter to All, or pick another date."
              : selectedDate
                ? `There are no voice sessions for ${formatSelectedDateLabel(selectedDate)}. Try another date, click All dates, or confirm you're viewing the same business as your customer app (${business?.slug ?? "check sidebar"}).`
                : `When a customer talks to Lorescale at display.lorescale.com/${business?.slug ?? "your-slug"}, the conversation transcript will appear here. Check the business switcher in the sidebar if you tested on a different workspace.`}
          </p>
        </div>
      ) : null}

      {!initialLoading && filteredSessions.length > 0 ? (
        <div className="space-y-6">
          {refreshing ? (
            <p className="px-1 text-xs text-slate-400">Refreshing…</p>
          ) : null}
          {groups.map((group) => (
            <section key={group.label}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-900">{group.label}</h2>
                <p className="text-xs text-slate-500">
                  {group.sessions.length}{" "}
                  {group.sessions.length === 1 ? "conversation" : "conversations"}
                </p>
              </div>

              <div className="space-y-3">
                {group.sessions.map((session) => (
                  <ConversationRow
                    key={session.id}
                    session={session}
                    expanded={expandedId === session.id}
                    detail={expandedId === session.id ? detail : null}
                    loadingDetail={expandedId === session.id && loadingDetail}
                    ending={endingId === session.id}
                    showKioskLabel={showKioskFilter}
                    onToggle={() =>
                      setExpandedId((current) => (current === session.id ? null : session.id))
                    }
                    onEnd={() => void handleEndConversation(session)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </>
  );
}
