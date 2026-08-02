import { OrderingFeatureGate } from "@/components/ordering-feature-gate";
import { OrdersPageClient } from "./orders-page-client";

export default function OrdersPage() {
  return (
    <OrderingFeatureGate>
      <OrdersPageClient />
    </OrderingFeatureGate>
  );
}
