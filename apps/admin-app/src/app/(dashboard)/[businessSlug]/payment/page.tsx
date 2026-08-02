import { OrderingFeatureGate } from "@/components/ordering-feature-gate";
import { PaymentPageClient } from "./payment-page-client";

export default function PaymentPage() {
  return (
    <OrderingFeatureGate>
      <PaymentPageClient />
    </OrderingFeatureGate>
  );
}
