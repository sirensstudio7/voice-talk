import type { HttpClient } from "../http";
import { StatsOverviewSchema, type StatsOverview, VoiceSessionListSchema, type VoiceSession, VoiceSessionDetailSchema, type VoiceSessionDetail } from "../schemas/analytics";
import { z } from "zod";

export async function getAnalytics(http: HttpClient, businessId: string): Promise<StatsOverview> {
  const data = await http.get(`/admin/businesses/${businessId}/stats/overview`);
  return StatsOverviewSchema.parse(data);
}

export async function getSessions(http: HttpClient, businessId: string, date?: string): Promise<VoiceSession[]> {
  const params = new URLSearchParams();
  if (date) {
    params.set("date", date);
    params.set("tz_offset", String(new Date().getTimezoneOffset()));
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const data = await http.get(`/admin/businesses/${businessId}/conversations${query}`);
  return VoiceSessionListSchema.parse(data);
}

export async function getSessionById(http: HttpClient, businessId: string, sessionId: string): Promise<VoiceSessionDetail> {
  const data = await http.get(`/admin/businesses/${businessId}/conversations/${sessionId}`);
  return VoiceSessionDetailSchema.parse(data);
}
