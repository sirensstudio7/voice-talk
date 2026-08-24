import { BusinessProvider } from "@/context/business-context";

import { LiveWatchClient } from "./live-watch-client";

export default async function LiveWatchPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  return (
    <BusinessProvider slug={slug}>
      <LiveWatchClient slug={slug} sessionId={sessionId} />
    </BusinessProvider>
  );
}
