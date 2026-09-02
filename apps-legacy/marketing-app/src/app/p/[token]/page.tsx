import { PhotoDownloadClient } from "./photo-download-client";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PhotoDownloadPage({ params }: PageProps) {
  const { token } = await params;
  return <PhotoDownloadClient token={token} />;
}
