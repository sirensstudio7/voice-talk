import { BookingFeatureGate } from "@/components/booking-feature-gate";
import { SchedulePageClient } from "./schedule-page-client";

export default function SchedulePage() {
  return (
    <BookingFeatureGate>
      <SchedulePageClient />
    </BookingFeatureGate>
  );
}
