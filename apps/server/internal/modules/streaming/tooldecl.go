package streaming

import "google.golang.org/genai"

// buildToolDeclarations returns the mutually-exclusive tool set for a
// session's mode, ported from apps-legacy/server/src/services/tools.ts,
// booking-tools.ts, and faq-tools.ts. Descriptions carry the sequencing
// rules verbatim from legacy — that's tacit knowledge worth preserving
// exactly, not summarizing. photoMomentEnabled is only ever true when
// mode == ModeOrdering (see session.go) and adds
// set_photo_souvenir_consent to the ordering set, matching tools.ts's
// buildToolDeclarations({ orderingEnabled, photoMomentEnabled }).
func buildToolDeclarations(mode Mode, photoMomentEnabled bool) []*genai.Tool {
	switch mode {
	case ModeOrdering:
		return orderingToolDeclarations(photoMomentEnabled)
	case ModeBooking:
		return bookingToolDeclarations()
	default:
		return faqToolDeclarations()
	}
}

func schema(properties map[string]*genai.Schema, required ...string) *genai.Schema {
	return &genai.Schema{Type: genai.TypeObject, Properties: properties, Required: required}
}

func stringProp(description string) *genai.Schema {
	return &genai.Schema{Type: genai.TypeString, Description: description}
}

func integerProp(description string) *genai.Schema {
	return &genai.Schema{Type: genai.TypeInteger, Description: description}
}

func orderingToolDeclarations(photoMomentEnabled bool) []*genai.Tool {
	setCustomerNameDescription := "Save the customer's name on the order receipt. Call ONLY after confirm_order, after all other checkout questions, after your standalone name question, and after the customer has spoken their name. The Pay your order screen opens automatically when this succeeds."
	promptPaymentDescription := "Prepare the Pay your order screen after your standalone name question. Call in the SAME turn as that name question — after all other checkout questions are done. The screen opens when set_customer_name succeeds. Never call before confirm_order or while asking loyalty or other checkout questions."
	if photoMomentEnabled {
		setCustomerNameDescription = "Save the customer's name on the order receipt. Call ONLY after confirm_order, after loyalty/other checkout questions, after set_photo_souvenir_consent, after your standalone name question, and after the customer has spoken their name. The Pay your order screen opens automatically when this succeeds."
		promptPaymentDescription = "Prepare the Pay your order screen after your standalone name question. Call in the SAME turn as that name question — after set_photo_souvenir_consent and all other checkout questions. The screen opens when set_customer_name succeeds. Never call before confirm_order, before the photo souvenir question, or while asking loyalty."
	}

	declarations := []*genai.FunctionDeclaration{
		{
			Name:        "search_products",
			Description: "Search menu items by name, category, or keyword.",
			Parameters:  schema(map[string]*genai.Schema{"query": stringProp("Search term such as latte, pastry, or coffee.")}, "query"),
		},
		{
			Name:        "add_to_order",
			Description: "Add a menu item to the customer's order. Call only after the customer clearly confirms the item by voice. Do not call for items the customer added via the menu screen.",
			Parameters: schema(map[string]*genai.Schema{
				"product_id": stringProp("Product id from search_products."),
				"quantity":   integerProp("How many to add."),
			}, "product_id"),
		},
		{
			Name:        "remove_from_order",
			Description: "Remove one item or reduce its quantity from the order. Use when the customer asks to remove a specific item. You can pass the product id or the item name (for example 'cold brew').",
			Parameters: schema(map[string]*genai.Schema{
				"product_id": stringProp("Product id or item name to remove."),
				"quantity":   integerProp("Optional quantity to remove."),
			}, "product_id"),
		},
		{
			Name:        "cancel_order",
			Description: "Cancel and clear the entire order. Use when the customer wants to cancel everything, start over, or empty their basket.",
			Parameters:  schema(nil),
		},
		{
			Name:        "get_order_summary",
			Description: "Get the current order items and total.",
			Parameters:  schema(nil),
		},
		{
			Name:        "confirm_order",
			Description: "Confirm the order when the customer says the basket is correct or they are ready to checkout (e.g. sudah benar, oke, iya, that's right). Call this tool immediately in that turn — do not only speak a confirmation. Call before loyalty, name, or payment questions.",
			Parameters:  schema(nil),
		},
	}

	if photoMomentEnabled {
		declarations = append(declarations, &genai.FunctionDeclaration{
			Name:        "set_photo_souvenir_consent",
			Description: "Record whether the customer wants a souvenir photo. Call AFTER loyalty/other checkout questions, AFTER they answer the photo yes/no question, and BEFORE asking for their name or calling prompt_payment.",
			Parameters:  schema(map[string]*genai.Schema{"consent": stringProp(`Use "yes" if they want a photo, "no" if they decline.`)}, "consent"),
		})
	}

	declarations = append(declarations,
		&genai.FunctionDeclaration{
			Name:        "set_customer_name",
			Description: setCustomerNameDescription,
			Parameters:  schema(map[string]*genai.Schema{"name": stringProp("The customer's name as they said it.")}, "name"),
		},
		&genai.FunctionDeclaration{
			Name:        "prompt_payment",
			Description: promptPaymentDescription,
			Parameters:  schema(nil),
		},
	)

	return []*genai.Tool{{FunctionDeclarations: declarations}}
}

func bookingToolDeclarations() []*genai.Tool {
	return []*genai.Tool{{FunctionDeclarations: []*genai.FunctionDeclaration{
		{
			Name:        "list_treatments",
			Description: "List available salon treatments/services with price and duration.",
			Parameters:  schema(nil),
		},
		{
			Name:        "check_availability",
			Description: "Check open appointment slots for a treatment on a given date (YYYY-MM-DD).",
			Parameters: schema(map[string]*genai.Schema{
				"product_id": stringProp("Treatment id from list_treatments."),
				"date":       stringProp("Date in YYYY-MM-DD format."),
			}, "product_id", "date"),
		},
		{
			Name:        "book_appointment",
			Description: "Book an appointment after the customer confirms treatment, date/time, and contact details.",
			Parameters: schema(map[string]*genai.Schema{
				"product_id":     stringProp("Treatment id."),
				"starts_at":      stringProp("ISO datetime for the slot start."),
				"customer_name":  stringProp("Customer full name."),
				"customer_phone": stringProp("Customer phone number."),
			}, "product_id", "starts_at", "customer_name"),
		},
		{
			Name:        "cancel_appointment",
			Description: "Cancel an appointment by id when the customer asks to cancel.",
			Parameters:  schema(map[string]*genai.Schema{"appointment_id": stringProp("Appointment id.")}, "appointment_id"),
		},
	}}}
}

func faqToolDeclarations() []*genai.Tool {
	return []*genai.Tool{{FunctionDeclarations: []*genai.FunctionDeclaration{
		{
			Name:        "end_conversation",
			Description: `End the FAQ conversation when the patient or customer is clearly done and has no more questions.`,
			Parameters: schema(map[string]*genai.Schema{
				"reason": stringProp(`Why the conversation is ending: "question_answered", "patient_goodbye", or "out_of_scope".`),
			}, "reason"),
		},
	}}}
}
