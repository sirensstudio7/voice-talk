import { z } from "zod";

export const StatsOverviewSchema = z.object({
  sessions_today: z.number(),
  orders_today: z.number(),
  revenue_today: z.number(),
  avg_order_value: z.number(),
  active_sessions: z.number(),
  avg_call_duration_seconds: z.number().nullable(),
});

export type StatsOverview = z.infer<typeof StatsOverviewSchema>;

export const StatsDailyPointSchema = z.object({
  date: z.string(),
  orders: z.number(),
  revenue: z.number(),
});

export type StatsDailyPoint = z.infer<typeof StatsDailyPointSchema>;

export const TopProductStatSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  quantity: z.number(),
  revenue: z.number(),
});

export type TopProductStat = z.infer<typeof TopProductStatSchema>;

export const TranscriptMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  text: z.string(),
  created_at: z.string(),
});

export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;

export const VoiceSessionSchema = z.object({
  id: z.string(),
  status: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  end_reason: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  message_count: z.number(),
  order_id: z.string().nullable(),
  order_total: z.number().nullable(),
});

export type VoiceSession = z.infer<typeof VoiceSessionSchema>;
export const VoiceSessionListSchema = z.array(VoiceSessionSchema);

export const VoiceSessionDetailSchema = VoiceSessionSchema.extend({
  messages: z.array(TranscriptMessageSchema),
});

export type VoiceSessionDetail = z.infer<typeof VoiceSessionDetailSchema>;
