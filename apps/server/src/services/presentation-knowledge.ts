import { and, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  presentationEmbeddings,
  presentationKnowledgeEntries,
} from "../db/schema.js";

/** Keep presentation_embeddings in sync so Q&A / Live can retrieve deck knowledge. */
export async function syncKnowledgeEmbedding(entry: {
  id: string;
  presentationId: string;
  title: string;
  content: string;
}): Promise<void> {
  await db
    .delete(presentationEmbeddings)
    .where(
      and(
        eq(presentationEmbeddings.presentationId, entry.presentationId),
        eq(presentationEmbeddings.sourceType, "knowledge"),
        eq(presentationEmbeddings.sourceId, entry.id),
      ),
    );

  const text = [entry.title.trim(), entry.content.trim()].filter(Boolean).join("\n\n");
  if (!text) return;

  await db.insert(presentationEmbeddings).values({
    presentationId: entry.presentationId,
    sourceType: "knowledge",
    sourceId: entry.id,
    chunkText: text,
    embeddingReference: "",
  });
}

export async function deleteKnowledgeEmbedding(
  presentationId: string,
  entryId: string,
): Promise<void> {
  await db
    .delete(presentationEmbeddings)
    .where(
      and(
        eq(presentationEmbeddings.presentationId, presentationId),
        eq(presentationEmbeddings.sourceType, "knowledge"),
        eq(presentationEmbeddings.sourceId, entryId),
      ),
    );
}

export async function listPresentationKnowledge(presentationId: string) {
  return db
    .select()
    .from(presentationKnowledgeEntries)
    .where(eq(presentationKnowledgeEntries.presentationId, presentationId))
    .orderBy(presentationKnowledgeEntries.sortOrder, presentationKnowledgeEntries.createdAt);
}
