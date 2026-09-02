import { BookingFeatureGate } from "@/components/booking-feature-gate";
import { AppointmentsPageClient } from "./appointments-page-client";

export default function AppointmentsPage() {
  return (
    <BookingFeatureGate>
      <AppointmentsPageClient />
    </BookingFeatureGate>
  );
}
