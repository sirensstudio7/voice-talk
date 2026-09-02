import { AssistantTemplateProvider } from "@/lib/assistant-template-context";

import { AiRulesPageClient } from "./ai-rules-page-client";

export default function AiRulesPage() {
  return (
    <AssistantTemplateProvider>
      <AiRulesPageClient />
    </AssistantTemplateProvider>
  );
}
