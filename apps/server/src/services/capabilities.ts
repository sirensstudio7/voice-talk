import { getBusinessCapabilities, withBookingAddon } from "@voicetalk/shared";
import { isBookingRuntimeActive } from "./booking.js";

export async function resolveCapabilities(business: {
  id: string;
  primaryUseCase: string | null;
  businessType: string | null;
}) {
  const base = getBusinessCapabilities(business.primaryUseCase, business.businessType);
  const bookingAddonActive = await isBookingRuntimeActive(business.id);
  return {
    capabilities: withBookingAddon(base, bookingAddonActive),
    bookingAddonActive,
  };
}
