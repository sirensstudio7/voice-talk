import { redirect } from "next/navigation";

import { PhotoDownloadClient } from "./photo-download-client";
import { publicApiUrl } from "@/lib/site-links";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PhotoDownloadPage({ params }: PageProps) {
  const { token } = await params;
  let photoUrl: string | undefined;
  try {
    const res = await fetch(
      `${publicApiUrl}/public/photo/download/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const data = (await res.json()) as { url?: string };
      photoUrl = data.url;
    }
  } catch {
    // Client page still tries the same public API.
  }
  if (photoUrl) redirect(photoUrl);
  return <PhotoDownloadClient token={token} apiUrl={publicApiUrl} />;
}
