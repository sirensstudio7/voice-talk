import { redirect } from "next/navigation";

/** Legacy /b/{slug} links redirect to /{slug}. */
export default async function LegacyBusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/${slug}`);
}
