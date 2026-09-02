import type { HttpClient } from "../http";
import { KnowledgeEntrySchema, KnowledgeEntryListSchema, type KnowledgeEntry } from "../schemas/knowledge";
import { z } from "zod";

export async function listKnowledge(http: HttpClient, businessId: string): Promise<KnowledgeEntry[]> {
  const data = await http.get(`/admin/businesses/${businessId}/knowledge`);
  return KnowledgeEntryListSchema.parse(data);
}

export async function createEntry(http: HttpClient, businessId: string, body: { category: string; title?: string; content: string }): Promise<KnowledgeEntry> {
  const data = await http.post(`/admin/businesses/${businessId}/knowledge`, body);
  return KnowledgeEntrySchema.parse(data);
}

export async function updateEntry(http: HttpClient, businessId: string, id: string, body: Partial<KnowledgeEntry>): Promise<KnowledgeEntry> {
  const data = await http.patch(`/admin/businesses/${businessId}/knowledge/${id}`, body);
  return KnowledgeEntrySchema.parse(data);
}

export async function deleteEntry(http: HttpClient, businessId: string, id: string): Promise<void> {
  await http.delete(`/admin/businesses/${businessId}/knowledge/${id}`);
}

export async function reorderEntries(http: HttpClient, businessId: string, entryIds: string[]): Promise<void> {
  await http.put(`/admin/businesses/${businessId}/knowledge/reorder`, { entry_ids: entryIds });
}
