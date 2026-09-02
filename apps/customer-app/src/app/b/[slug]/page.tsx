import { BusinessProvider } from "@/context/business-context";
import { VoiceStage } from "@/features/voice/VoiceStage";

export default function KioskPage({ params }: { params: { slug: string } }) {
  return (
    <BusinessProvider slug={params.slug}>
      <VoiceStage />
    </BusinessProvider>
  );
}
