import { MenuFeatureGate } from "@/components/menu-feature-gate";
import { MenuPageClient } from "./menu-page-client";

export default function MenuPage() {
  return (
    <MenuFeatureGate>
      <MenuPageClient />
    </MenuFeatureGate>
  );
}
