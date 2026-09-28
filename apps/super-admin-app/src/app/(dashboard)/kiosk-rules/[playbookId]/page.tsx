import { notFound } from "next/navigation";

import { isPlaybookId } from "@/lib/kiosk-rule-playbooks";

import { KioskRulesPageClient } from "../kiosk-rules-page-client";

export default async function KioskRulePlaybookPage({
  params,
}: {
  params: Promise<{ playbookId: string }>;
}) {
  const { playbookId } = await params;
  if (!isPlaybookId(playbookId)) notFound();
  return <KioskRulesPageClient playbookId={playbookId} />;
}
