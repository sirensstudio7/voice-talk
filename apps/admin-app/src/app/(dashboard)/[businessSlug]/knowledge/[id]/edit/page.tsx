import { KnowledgeFormPageClient } from "../../knowledge-form-page-client";

export default async function EditKnowledgeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KnowledgeFormPageClient entryId={id} />;
}
