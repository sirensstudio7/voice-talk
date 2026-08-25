// Package capabilities derives what a business's kiosk experience should
// offer — ordering, booking, menu display — from its primary_use_case and
// business_type. Ported from
// packages/shared/src/business-capabilities.ts, the legacy app's single
// source of truth for this; every module gating public/kiosk behavior by
// business type should derive it from here rather than re-deriving its
// own rule.
package capabilities

type PrimaryUseCase string

const (
	UseCaseOrders       PrimaryUseCase = "orders"
	UseCaseFAQs         PrimaryUseCase = "faqs"
	UseCaseBoth         PrimaryUseCase = "both"
	UseCaseAppointments PrimaryUseCase = "appointments"
)

var validUseCases = map[PrimaryUseCase]bool{
	UseCaseOrders: true, UseCaseFAQs: true, UseCaseBoth: true, UseCaseAppointments: true,
}

func NormalizePrimaryUseCase(value string) PrimaryUseCase {
	uc := PrimaryUseCase(value)
	if validUseCases[uc] {
		return uc
	}
	return UseCaseBoth
}

func IsSalonBusiness(businessType string) bool {
	return businessType == "salon"
}

type Capabilities struct {
	PrimaryUseCase  PrimaryUseCase `json:"primary_use_case"`
	SalonMode       bool           `json:"salon_mode"`
	BookingEnabled  bool           `json:"booking_enabled"`
	OrderingEnabled bool           `json:"ordering_enabled"`
	MenuEnabled     bool           `json:"menu_enabled"`
	PaymentEnabled  bool           `json:"payment_enabled"`
}

// Get derives a business's capabilities from its primary_use_case and
// business_type columns.
func Get(useCase, businessType string) Capabilities {
	salonMode := IsSalonBusiness(businessType)
	primaryUseCase := NormalizePrimaryUseCase(useCase)

	if salonMode && primaryUseCase == UseCaseOrders {
		primaryUseCase = UseCaseAppointments
	}

	if salonMode {
		bookingEnabled := primaryUseCase == UseCaseAppointments || primaryUseCase == UseCaseBoth
		return Capabilities{
			PrimaryUseCase:  primaryUseCase,
			SalonMode:       true,
			BookingEnabled:  bookingEnabled,
			MenuEnabled:     bookingEnabled,
			OrderingEnabled: false,
			PaymentEnabled:  false,
		}
	}

	orderingEnabled := primaryUseCase != UseCaseFAQs
	return Capabilities{
		PrimaryUseCase:  primaryUseCase,
		SalonMode:       false,
		BookingEnabled:  false,
		MenuEnabled:     orderingEnabled,
		OrderingEnabled: orderingEnabled,
		PaymentEnabled:  orderingEnabled,
	}
}
