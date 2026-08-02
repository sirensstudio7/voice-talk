import { PresentationPreviewClient } from "./presentation-preview-client";

export default async function PresentationPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PresentationPreviewClient presentationId={id} />;
}
