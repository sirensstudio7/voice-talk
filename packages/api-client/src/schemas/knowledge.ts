import { z } from "zod";

export const KnowledgeEntrySchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  content: z.string(),
  sort_order: z.number(),
});

export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;
export const KnowledgeEntryListSchema = z.array(KnowledgeEntrySchema);
