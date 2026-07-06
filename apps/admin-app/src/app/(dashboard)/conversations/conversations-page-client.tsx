"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, ChevronDown, MessageSquare, User } from "lucide-react";

import { PageHeader, StatCard } from "@/components/ui";
import { api, type TranscriptMessage, type VoiceSession, type VoiceSessionDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseApiDate } from "@/lib/dates";
import { formatCurrency } from "@voicetalk/shared";

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

function todayDateInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
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

function TranscriptBubble({ message }: { message: TranscriptMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-orange-100 text-orange-600" : "bg-slate-200 text-slate-600"
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
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
  return (
    <article
      className={`rounded-xl border bg-white shadow-sm transition-all ${
        expanded
          ? "border-slate-300 shadow-md ring-1 ring-slate-200/80"
          : "border-slate-200 hover:border-slate-300 hover:shadow"
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

          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
          {loadingDetail ? (
            <p className="text-sm text-slate-500">Loading transcript…</p>
          ) : detail && detail.messages.length > 0 ? (
            <div className="space-y-3">
              {detail.messages.map((message) => (
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

  useEffect(() => {
    if (!token || !business) return;

    const load = () => api.listConversations(token, business.id, selectedDate ?? undefined).then(setSessions);

    void load();
    const interval = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(interval);
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

  const groups = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  const stats = useMemo(() => {
    const ended = sessions.filter((s) => s.duration_seconds !== null);
    const avgDuration =
      ended.length > 0
        ? ended.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) / ended.length
        : null;
    const withOrder = sessions.filter((s) => s.order_id).length;
    return { count: sessions.length, avgDuration, withOrder };
  }, [sessions]);

  const subtitle = useMemo(() => {
    if (sessions.length === 0) {
      return selectedDate
        ? `No conversations on ${formatSelectedDateLabel(selectedDate)}.`
        : "Customer–AI voice conversation history and transcripts.";
    }

    const countLabel = `${sessions.length} ${sessions.length === 1 ? "conversation" : "conversations"}`;
    if (selectedDate) {
      return `${countLabel} on ${formatSelectedDateLabel(selectedDate)} · refreshes every 10s`;
    }
    return `${countLabel} · refreshes every 10s`;
  }, [sessions.length, selectedDate]);

  return (
    <>
      <PageHeader
        title="Conversations"
        subtitle={subtitle}
        action={
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="conversations-date-filter" className="text-sm text-slate-500">
              Date
            </label>
            <input
              id="conversations-date-filter"
              type="date"
              value={selectedDate ?? ""}
              max={todayDateInputValue()}
              onChange={(event) => setSelectedDate(event.target.value || null)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
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
        }
      />

      {sessions.length > 0 ? (
        <div className="mb-6 grid gap-[16px] sm:grid-cols-3">
          <StatCard label="Total conversations" value={String(stats.count)} />
          <StatCard
            label="Avg call duration"
            value={stats.avgDuration !== null ? formatDuration(Math.round(stats.avgDuration)) : "—"}
          />
          <StatCard label="With order" value={String(stats.withOrder)} />
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <MessageSquare className="h-7 w-7" />
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {selectedDate ? "No conversations on this date" : "No conversations yet"}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            {selectedDate
              ? `There are no voice sessions for ${formatSelectedDateLabel(selectedDate)}. Try another date or view all dates.`
              : "When a customer talks to Eva, the conversation transcript will appear here automatically."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
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
      )}
    </>
  );
}
