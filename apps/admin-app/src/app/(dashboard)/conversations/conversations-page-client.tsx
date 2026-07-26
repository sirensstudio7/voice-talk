"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownTrayIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  CodeBracketIcon,
  CpuChipIcon,
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
import { api, type TranscriptMessage, type VoiceSession, type VoiceSessionDetail } from "@/lib/api";
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

function orderFilterPillClass(active: boolean) {
  return [
    "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-slate-900 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

type OrderFilter = "all" | "with_order" | "no_order";

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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ended: "bg-slate-100 text-slate-600 ring-slate-500/10",
    active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${
        styles[status.toLowerCase()] ?? "bg-slate-100 text-slate-600 ring-slate-500/10"
      }`}
    >
      {status}
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
  };

  const styles: Record<string, string> = {
    question_answered: "bg-blue-50 text-blue-700",
    patient_goodbye: "bg-violet-50 text-violet-700",
    out_of_scope: "bg-amber-50 text-amber-700",
    idle_timeout: "bg-orange-50 text-orange-700",
    manual: "bg-slate-100 text-slate-600",
    disconnected: "bg-slate-100 text-slate-600",
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

function ConversationRow({
  session,
  expanded,
  detail,
  loadingDetail,
  onToggle,
}: {
  session: VoiceSession;
  expanded: boolean;
  detail: VoiceSessionDetail | null;
  loadingDetail: boolean;
  onToggle: () => void;
}) {
  const messages = useMemo(
    () => (detail ? mergeTranscriptMessages(detail.messages) : []),
    [detail],
  );

  return (
    <article
      className={`rounded-xl border bg-white transition-all ${
        expanded
          ? "border-slate-300 ring-1 ring-slate-200/80"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full px-4 py-4 text-left sm:px-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                {formatTimestamp(session.started_at)}
              </span>
              <StatusBadge status={session.status} />
              {session.status === "ended" ? (
                <EndReasonBadge reason={session.end_reason} />
              ) : null}
              <span className="text-xs text-slate-500">
                {formatDuration(session.duration_seconds)}
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
            </div>
          </div>

          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        const data = await api.listConversations(token, business.id, selectedDate ?? undefined);
        if (!cancelled) setSessions(data);
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
  }, [token, business, selectedDate]);

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
    () => sessions.filter((session) => matchesOrderFilter(session, orderFilter)),
    [sessions, orderFilter],
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
    return { count: filteredSessions.length, avgDuration, withOrder };
  }, [filteredSessions]);

  const subtitle = useMemo(() => {
    const orderNote = orderFilter !== "all" ? ` · ${orderFilterLabel(orderFilter)} only` : "";

    if (filteredSessions.length === 0) {
      if (sessions.length > 0 && orderFilter !== "all") {
        return `No conversations ${orderFilterLabel(orderFilter)} in this view.`;
      }
      return selectedDate
        ? `No conversations on ${formatSelectedDateLabel(selectedDate)}.`
        : "Customer–AI voice conversation history and transcripts.";
    }

    const countLabel = `${filteredSessions.length} ${filteredSessions.length === 1 ? "conversation" : "conversations"}`;
    const cappedNote = !selectedDate && sessions.length >= 200 ? " · showing latest 200" : "";
    if (selectedDate) {
      return `${countLabel} on ${formatSelectedDateLabel(selectedDate)}${orderNote}${cappedNote} · refreshes every 10s`;
    }
    return `${countLabel}${orderNote}${cappedNote} · refreshes every 10s`;
  }, [filteredSessions.length, sessions.length, selectedDate, orderFilter]);

  const exportData = business
    ? {
        businessSlug: business.slug,
        filterDate: selectedDate,
      }
    : null;

  const fetchConversationDetails = async () => {
    if (!token || !business || filteredSessions.length === 0) return [];

    const exportedIds = new Set(filteredSessions.map((session) => session.id));
    const allDetails = await api.exportConversations(token, business.id, selectedDate ?? undefined);
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

      {initialLoading && sessions.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : null}

      {!initialLoading && filteredSessions.length > 0 ? (
        <div className="mb-6 grid gap-[16px] sm:grid-cols-3">
          <StatCard label="Total conversations" value={String(stats.count)} />
          <StatCard
            label="Avg call duration"
            value={stats.avgDuration !== null ? formatDuration(Math.round(stats.avgDuration)) : "—"}
          />
          <StatCard label="With order" value={String(stats.withOrder)} />
        </div>
      ) : null}

      {!initialLoading ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Filter by order"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1"
          >
            <button
              type="button"
              onClick={() => setOrderFilter("all")}
              className={orderFilterPillClass(orderFilter === "all")}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setOrderFilter("with_order")}
              className={orderFilterPillClass(orderFilter === "with_order")}
            >
              Order
            </button>
            <button
              type="button"
              onClick={() => setOrderFilter("no_order")}
              className={orderFilterPillClass(orderFilter === "no_order")}
            >
              No order
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker
              id="conversations-date-filter"
              value={selectedDate}
              onChange={setSelectedDate}
              maxDate={todayDateInputValue()}
            />
            {selectedDate ? (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
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
            {orderFilter !== "all" && sessions.length > 0
              ? orderFilter === "with_order"
                ? "No conversations with an order"
                : "No conversations without an order"
              : selectedDate
                ? "No conversations on this date"
                : "No conversations yet"}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            {orderFilter !== "all" && sessions.length > 0
              ? "Try switching the order filter to All, or pick another date range."
              : selectedDate
                ? `There are no voice sessions for ${formatSelectedDateLabel(selectedDate)}. Try another date, click All dates, or confirm you're viewing the same business as your customer app (${business?.slug ?? "check sidebar"}).`
                : `When a customer talks to Lorescale at /b/${business?.slug ?? "your-slug"}, the conversation transcript will appear here. Check the business switcher in the sidebar if you tested on a different workspace.`}
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
                    onToggle={() =>
                      setExpandedId((current) => (current === session.id ? null : session.id))
                    }
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
