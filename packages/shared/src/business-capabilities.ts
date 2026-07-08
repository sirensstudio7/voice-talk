export type PrimaryUseCase = "orders" | "faqs" | "both" | "appointments";

export type BusinessCapabilities = {
  primary_use_case: PrimaryUseCase;
  salon_mode: boolean;
  booking_enabled: boolean;
  ordering_enabled: boolean;
  menu_enabled: boolean;
  payment_enabled: boolean;
};

const VALID_USE_CASES = new Set<PrimaryUseCase>(["orders", "faqs", "both", "appointments"]);

export function isSalonBusiness(businessType: string | null | undefined): boolean {
  return businessType === "salon";
}

export function normalizePrimaryUseCase(value: string | null | undefined): PrimaryUseCase {
  if (value && VALID_USE_CASES.has(value as PrimaryUseCase)) {
    return value as PrimaryUseCase;
  }
  return "both";
}

export function getBusinessCapabilities(
  useCase: PrimaryUseCase | string | null | undefined,
  businessType?: string | null,
): BusinessCapabilities {
  const salonMode = isSalonBusiness(businessType);
  let primaryUseCase = normalizePrimaryUseCase(useCase);

  if (salonMode && primaryUseCase === "orders") {
    primaryUseCase = "appointments";
  }

  if (salonMode) {
    const bookingEnabled = primaryUseCase === "appointments" || primaryUseCase === "both";
    return {
      primary_use_case: primaryUseCase,
      salon_mode: true,
      booking_enabled: bookingEnabled,
      menu_enabled: bookingEnabled,
      ordering_enabled: false,
      payment_enabled: false,
    };
  }

  const orderingEnabled = primaryUseCase !== "faqs";
  return {
    primary_use_case: primaryUseCase,
    salon_mode: false,
    booking_enabled: false,
    menu_enabled: orderingEnabled,
    ordering_enabled: orderingEnabled,
    payment_enabled: orderingEnabled,
  };
}
