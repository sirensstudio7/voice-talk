import { PresentationDetailClient } from "./presentation-detail-client";

export default async function PresentationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PresentationDetailClient presentationId={id} />;
}
