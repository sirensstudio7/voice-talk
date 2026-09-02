import { LiveSessionClient } from "./live-session-client";

export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiveSessionClient sessionId={id} />;
}
