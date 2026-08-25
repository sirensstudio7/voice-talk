package promptkit

import (
	"sort"
	"strconv"
	"strings"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/capabilities"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/pricing"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// This file is a direct, section-by-section port of
// apps-legacy/server/src/services/config-builder.ts's
// buildSystemInstruction — the ~700-line hand-tuned bilingual
// (id/en) prompt compiler that is, per the streaming Phase 2 plan, the
// single most tacit-knowledge-heavy piece of the legacy app. Section
// text below is copied verbatim, not paraphrased. One deliberate
// omission: legacy's Smart Photo Moment addon (photoMomentEnabled /
// set_photo_souvenir_consent branch) is left out — that add-on has no
// Go module yet (internal/modules/photomoment is a stub), so only the
// plain (non-photo) FOOD_CHECKOUT_CLOSING text is ported.

const (
	defaultTone            = "friendly"
	defaultLanguage        = "id"
	defaultAssistantNameID = "Lorescale"
)

var languagePresetsOrdering = map[string]string{
	"id": "Selalu gunakan Bahasa Indonesia saat berbicara dengan pelanggan. Gunakan bahasa yang natural, sopan, dan ramah seperti kasir di Indonesia. Jika pelanggan berbicara dalam bahasa lain, tetap balas dalam Bahasa Indonesia kecuali mereka meminta sebaliknya.",
	"en": "Always speak English with customers. Use natural, polite, and friendly language like a real cashier. If the customer speaks another language, still reply in English unless they ask otherwise.",
}

var languagePresetsFAQ = map[string]string{
	"id": "Selalu gunakan Bahasa Indonesia saat berbicara dengan pelanggan. Gunakan bahasa yang natural, sopan, dan ramah seperti agen layanan pelanggan. Jika pelanggan berbicara dalam bahasa lain, tetap balas dalam Bahasa Indonesia kecuali mereka meminta sebaliknya. Jangan mengarahkan percakapan ke pesanan kopi, makanan, atau menu kecuali itu memang bagian dari layanan bisnis ini.",
	"en": "Always speak English with customers. Use natural, polite, and friendly language like a customer service agent. If the customer speaks another language, still reply in English unless they ask otherwise. Do not steer the conversation toward coffee, food, or menu orders unless that is part of this business.",
}

var languagePresetsBooking = map[string]string{
	"id": "Selalu gunakan Bahasa Indonesia saat berbicara dengan pelanggan. Gunakan bahasa yang natural, sopan, dan ramah seperti resepsionis. Jika pelanggan berbicara dalam bahasa lain, tetap balas dalam Bahasa Indonesia kecuali mereka meminta sebaliknya.",
	"en": "Always speak English with customers. Use natural, polite, and friendly language like a receptionist. If the customer speaks another language, still reply in English unless they ask otherwise.",
}

var tonePresetsOrdering = map[string]map[string]string{
	"id": {
		"friendly":     "Gaya bicara: Ramah dan hangat.\nSapa pelanggan dengan senyum dalam suara — gunakan sapaan yang akrab seperti \"Halo!\" atau \"Selamat datang!\".\nTunjukkan antusiasme saat membantu dan konfirmasi pesanan dengan nada positif.\nTetap ringkas dan jelas, jangan terlalu panjang.",
		"professional": "Gaya bicara: Profesional dan sopan.\nGunakan bahasa formal dan terstruktur — hindari slang, singkatan, atau ekspresi terlalu santai.\nSapa pelanggan dengan \"Selamat datang\" atau \"Baik, Bapak/Ibu\".\nFokus pada efisiensi: jawab pertanyaan secara langsung, konfirmasi pesanan dengan jelas dan rapi.",
		"casual":       "Gaya bicara: Santai dan akrab.\nBerbicaralah seperti barista teman — nada ringan, natural, dan tidak kaku.\nBoleh gunakan ekspresi sehari-hari yang umum di Indonesia, asalkan tetap sopan.\nJaga respons tetap singkat dan conversational, seperti ngobrol di warung kopi.",
	},
	"en": {
		"friendly":     "Speaking style: Warm and friendly.\nGreet customers with a smile in your voice — use welcoming phrases like \"Hi there!\" or \"Welcome!\".\nShow enthusiasm when helping and confirm orders with a positive tone.\nKeep responses concise and clear.",
		"professional": "Speaking style: Professional and polite.\nUse formal, structured language — avoid slang, abbreviations, or overly casual expressions.\nGreet customers with \"Welcome\" or \"Good day\".\nFocus on efficiency: answer questions directly and confirm orders clearly.",
		"casual":       "Speaking style: Relaxed and approachable.\nTalk like a friendly barista — light, natural, and not stiff.\nEveryday expressions are fine as long as you stay polite.\nKeep responses short and conversational.",
	},
}

var tonePresetsFAQ = map[string]map[string]string{
	"id": {
		"friendly":     "Gaya bicara: Ramah dan hangat.\nSapa pelanggan dengan senyum dalam suara — gunakan sapaan seperti \"Halo!\" atau \"Selamat datang!\".\nBantu menjawab pertanyaan dengan jelas. Jangan menawarkan pesanan kopi/makanan atau upsell menu.\nTetap ringkas dan jelas.",
		"professional": "Gaya bicara: Profesional dan sopan.\nGunakan bahasa formal dan terstruktur.\nSapa pelanggan dengan \"Selamat datang\" atau \"Baik, Bapak/Ibu\".\nFokus menjawab pertanyaan layanan, kebijakan, dan informasi bisnis secara langsung.",
		"casual":       "Gaya bicara: Santai dan akrab.\nNada ringan, natural, dan tidak kaku — seperti agen CS yang ramah.\nBoleh gunakan ekspresi sehari-hari yang sopan.\nJaga respons singkat; jangan mengarahkan ke pesanan makanan atau kopi.",
	},
	"en": {
		"friendly":     "Speaking style: Warm and friendly.\nGreet customers with \"Hi there!\" or \"Welcome!\".\nAnswer questions clearly. Do not offer coffee/food orders or menu upsells.\nKeep responses concise.",
		"professional": "Speaking style: Professional and polite.\nUse formal, structured language.\nGreet customers with \"Welcome\" or \"Good day\".\nFocus on answering service, policy, and business questions directly.",
		"casual":       "Speaking style: Relaxed and approachable.\nTalk like a friendly support agent — light and natural.\nEveryday expressions are fine if polite.\nKeep responses short; do not steer toward food or coffee orders.",
	},
}

var tonePresetsBooking = map[string]map[string]string{
	"id": {
		"friendly":     "Gaya bicara: Ramah dan hangat.\nSapa pelanggan dengan \"Halo!\" atau \"Selamat datang!\".\nBantu memilih layanan dan jadwal dengan nada positif.\nTetap ringkas dan jelas.",
		"professional": "Gaya bicara: Profesional dan sopan.\nGunakan bahasa formal dan terstruktur.\nSapa pelanggan dengan \"Selamat datang\" atau \"Baik, Bapak/Ibu\".\nFokus pada efisiensi booking dan informasi layanan.",
		"casual":       "Gaya bicara: Santai dan akrab.\nNada ringan dan natural seperti resepsionis yang ramah.\nJaga respons singkat dan conversational.",
	},
	"en": {
		"friendly":     "Speaking style: Warm and friendly.\nGreet customers with \"Hi there!\" or \"Welcome!\".\nHelp with services and scheduling in a positive tone.\nKeep responses concise.",
		"professional": "Speaking style: Professional and polite.\nUse formal, structured language.\nGreet customers with \"Welcome\" or \"Good day\".\nFocus on efficient booking and service information.",
		"casual":       "Speaking style: Relaxed and approachable.\nTalk like a friendly receptionist — light and natural.\nKeep responses short and conversational.",
	},
}

const foodCheckoutClosingEN = "Checkout closing order (mandatory — overrides any earlier checkout order):\n" +
	"0. When the customer says the basket is correct or they are ready (e.g. \"that's right\", \"yes\", \"ok\", \"sudah benar\"), call confirm_order IMMEDIATELY. Never ask them to confirm the order again after that.\n" +
	"1. After confirm_order, ask loyalty card and any other checkout questions from your knowledge base first — one topic per turn. Skip questions already answered.\n" +
	"2. Always ask for the customer's name last — in its own separate turn, immediately before payment.\n" +
	"3. The name question must be the ONLY sentence/question in that turn. Do not mention loyalty, upsell, phone, or anything else in the same turn.\n" +
	"4. In that same turn as the standalone name question, call prompt_payment to prepare checkout.\n" +
	"5. When the customer answers with their name, call set_customer_name immediately — the Pay your order screen opens then.\n" +
	"Never call prompt_payment before confirm_order.\n" +
	"Never call prompt_payment while still asking loyalty or other checkout questions.\n" +
	"Never ask for the name before loyalty card or other checkout questions.\n" +
	"Never bundle the name question with any other question.\n" +
	"Never repeat a checkout question the customer already answered.\n" +
	"BAD (never say): \"Do you have a loyalty card and what's your name?\" or \"Anything else? May I have your name?\"\n" +
	"GOOD (say exactly one question, then call prompt_payment): \"May I have your name?\" or \"Boleh tahu nama Anda?\""

const foodCheckoutClosingID = "Urutan penutupan checkout (wajib — mengoverride urutan checkout sebelumnya):\n" +
	"0. Saat pelanggan bilang pesanan sudah benar atau siap (misalnya \"sudah benar\", \"iya\", \"oke\"), segera panggil confirm_order. Jangan minta konfirmasi pesanan lagi setelah itu.\n" +
	"1. Setelah confirm_order, tanyakan kartu loyalitas dan pertanyaan checkout lain dari basis pengetahuan dulu — satu topik per turn. Lewati pertanyaan yang sudah dijawab.\n" +
	"2. Selalu tanyakan nama pelanggan terakhir — di turn terpisah, tepat sebelum pembayaran.\n" +
	"3. Pertanyaan nama harus SATU-SATUNYA kalimat/pertanyaan di turn itu. Jangan sebut loyalitas, upsell, telepon, atau hal lain di turn yang sama.\n" +
	"4. Di turn yang sama dengan pertanyaan nama standalone, panggil prompt_payment untuk menyiapkan checkout.\n" +
	"5. Saat pelanggan menjawab dengan nama mereka, segera panggil set_customer_name — layar Bayar pesanan Anda terbuka saat itu.\n" +
	"Jangan panggil prompt_payment sebelum confirm_order.\n" +
	"Jangan panggil prompt_payment saat masih menanyakan kartu loyalitas atau pertanyaan checkout lain.\n" +
	"Jangan tanyakan nama sebelum kartu loyalitas atau pertanyaan checkout lainnya.\n" +
	"Jangan gabungkan pertanyaan nama dengan pertanyaan lain.\n" +
	"Jangan ulangi pertanyaan checkout yang sudah dijawab pelanggan.\n" +
	"SALAH (jangan ucapkan): \"Punya kartu loyalitas? Boleh tahu nama?\" atau \"Mau tambah? Siapa namanya?\"\n" +
	"BENAR (hanya satu pertanyaan, lalu panggil prompt_payment): \"Boleh tahu nama Anda?\" atau \"May I have your name?\""

// resolveLanguage ports config-builder.ts's resolveLanguage.
func resolveLanguage(rules store.AiRule, languageOverride string) string {
	if o := strings.ToLower(strings.TrimSpace(languageOverride)); o != "" {
		if _, ok := languagePresetsOrdering[o]; ok {
			return o
		}
	}
	language := strings.ToLower(strings.TrimSpace(rules.Language))
	if _, ok := languagePresetsOrdering[language]; !ok {
		language = defaultLanguage
	}
	return language
}

// resolveAssistantName ports config-builder.ts's resolveAssistantName.
func resolveAssistantName(rules store.AiRule) string {
	name := strings.TrimSpace(rules.AssistantName)
	if name == "" {
		return defaultAssistantNameID
	}
	return name
}

func looksLikeOrderingOrCoffeePersonality(text string) bool {
	p := strings.ToLower(text)
	for _, needle := range []string{"kasir ai", "ai cashier", "toko kopi", "barista", "warung kopi", "coffee shop", "sunrise coffee"} {
		if strings.Contains(p, needle) {
			return true
		}
	}
	return false
}

func looksLikeOrderingToolInstructions(text string) bool {
	for _, needle := range []string{"add_to_order", "confirm_order", "prompt_payment", "remove_from_order"} {
		if strings.Contains(text, needle) {
			return true
		}
	}
	return false
}

// ActiveProducts ports config-builder.ts's getActiveProducts: active
// only, sorted by sort order then name.
func ActiveProducts(products []store.Product) []store.Product {
	active := make([]store.Product, 0, len(products))
	for _, p := range products {
		if p.IsActive {
			active = append(active, p)
		}
	}
	sort.SliceStable(active, func(i, j int) bool {
		if active[i].SortOrder != active[j].SortOrder {
			return active[i].SortOrder < active[j].SortOrder
		}
		return active[i].Name < active[j].Name
	})
	return active
}

// formatRupiah renders an integer amount with Indonesian "." thousand
// separators, matching legacy's toLocaleString("id-ID").
func formatRupiah(amount float64) string {
	n := int64(amount + 0.5)
	s := strconv.FormatInt(n, 10)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, c)
	}
	if neg {
		return "-" + string(out)
	}
	return string(out)
}

func formatPercent(f float64) string {
	return strconv.FormatFloat(f, 'f', -1, 64)
}

func formatProductLine(p store.Product) string {
	sale := pricing.EffectivePrice(p.Price, p.DiscountPercent)
	var priceLabel string
	if p.DiscountPercent > 0 {
		priceLabel = "Rp " + formatRupiah(sale) + " (diskon " + formatPercent(p.DiscountPercent) + "%, harga normal Rp " + formatRupiah(p.Price) + ")"
	} else {
		priceLabel = "Rp " + formatRupiah(p.Price)
	}
	return "- " + p.Name + " (" + priceLabel + ", " + p.Category + "): " + p.Description
}

// BuildSystemInstruction is the Go port of config-builder.ts's
// buildSystemInstruction. See the streaming Phase 2 plan for the section
// structure this follows.
func BuildSystemInstruction(business store.Business, rules store.AiRule, entries []store.KnowledgeEntry, products []store.Product, languageOverride string) string {
	productList := ActiveProducts(products)

	knowledge := make([]store.KnowledgeEntry, len(entries))
	copy(knowledge, entries)
	sort.SliceStable(knowledge, func(i, j int) bool {
		if knowledge[i].SortOrder != knowledge[j].SortOrder {
			return knowledge[i].SortOrder < knowledge[j].SortOrder
		}
		return knowledge[i].Category < knowledge[j].Category
	})

	language := resolveLanguage(rules, languageOverride)
	assistantName := resolveAssistantName(rules)

	caps := capabilities.Get(business.PrimaryUseCase, business.BusinessType)
	orderingEnabled := caps.OrderingEnabled
	bookingEnabled := caps.BookingEnabled
	faqOnly := !orderingEnabled && !bookingEnabled

	languagePresets := languagePresetsOrdering
	switch {
	case bookingEnabled:
		languagePresets = languagePresetsBooking
	case faqOnly:
		languagePresets = languagePresetsFAQ
	}

	tonePresetSet := tonePresetsOrdering
	switch {
	case bookingEnabled:
		tonePresetSet = tonePresetsBooking
	case faqOnly:
		tonePresetSet = tonePresetsFAQ
	}
	tonePresets := tonePresetSet[language]

	var defaultPersonality string
	switch {
	case language == "en" && bookingEnabled:
		defaultPersonality = "You are " + assistantName + ", a friendly AI salon receptionist."
	case language == "en" && orderingEnabled:
		defaultPersonality = "You are " + assistantName + ", a friendly AI cashier."
	case language == "en":
		defaultPersonality = "You are " + assistantName + ", a friendly AI customer service agent for " + business.Name + ". Do not invent a coffee shop or restaurant context."
	case bookingEnabled:
		defaultPersonality = "Kamu adalah " + assistantName + ", resepsionis AI salon yang ramah."
	case orderingEnabled:
		defaultPersonality = "Kamu adalah " + assistantName + ", kasir AI yang ramah."
	default:
		defaultPersonality = "Kamu adalah " + assistantName + ", agen layanan pelanggan AI yang ramah di " + business.Name + ". Jangan mengarang konteks kafe, kopi, atau restoran."
	}

	personalityRaw := strings.TrimSpace(rules.Personality)
	personality := defaultPersonality
	if personalityRaw != "" && (!faqOnly || !looksLikeOrderingOrCoffeePersonality(personalityRaw)) {
		personality = personalityRaw
	}

	tone := strings.ToLower(strings.TrimSpace(rules.Tone))
	if _, ok := tonePresets[tone]; !ok {
		tone = defaultTone
	}

	behavioral := rules.BehavioralRules
	toolInstructionsRaw := strings.TrimSpace(rules.ToolInstructions)
	toolInstructions := toolInstructionsRaw
	if faqOnly && toolInstructionsRaw != "" && looksLikeOrderingToolInstructions(toolInstructionsRaw) {
		toolInstructions = ""
	}
	voiceSpeakingStyle := VoiceSpeakingStyle(rules.VoicePreset)

	var productLineParts []string
	for _, p := range productList {
		productLineParts = append(productLineParts, formatProductLine(p))
	}
	productLines := strings.Join(productLineParts, "\n")

	var knowledgeLineParts []string
	for _, k := range knowledge {
		title := strings.TrimSpace(k.Title)
		if title != "" {
			knowledgeLineParts = append(knowledgeLineParts, "- "+title+": "+k.Content)
		} else {
			knowledgeLineParts = append(knowledgeLineParts, "- "+k.Content)
		}
	}
	knowledgeLines := strings.Join(knowledgeLineParts, "\n")

	defaultToolsEn := defaultToolsTextEN(orderingEnabled, bookingEnabled)
	defaultToolsID := defaultToolsTextID(orderingEnabled, bookingEnabled)

	var sections []string
	if language == "en" {
		sections = append(sections,
			"Your name is "+assistantName+". Use this name when introducing yourself.",
			strings.TrimSpace(personality),
			tonePresets[tone],
			"Language:\n"+languagePresets[language],
			"Store: "+business.Name+" — "+business.Tagline,
		)
		if orderingEnabled || bookingEnabled {
			label := "Menu"
			empty := "- No menu items configured yet."
			if bookingEnabled {
				label, empty = "Treatments", "- No treatments configured yet."
			}
			body := productLines
			if body == "" {
				body = empty
			}
			sections = append(sections, label+":\n"+body)
		}
		knowledgeBody := knowledgeLines
		if knowledgeBody == "" {
			knowledgeBody = "- No knowledge entries configured yet."
		}
		sections = append(sections, "Knowledge:\n"+knowledgeBody)
		if strings.TrimSpace(behavioral) != "" {
			sections = append(sections, "Behavior rules:\n"+strings.TrimSpace(behavioral))
		}
		toolsSection := toolInstructions
		if toolsSection == "" {
			toolsSection = defaultToolsEn
		}
		if orderingEnabled && !bookingEnabled {
			toolsSection += "\n\n" + foodCheckoutClosingEN
		}
		sections = append(sections, toolsSection)
	} else {
		sections = append(sections,
			"Namamu adalah "+assistantName+". Gunakan nama ini saat memperkenalkan diri.",
			strings.TrimSpace(personality),
			tonePresets[tone],
			"Bahasa:\n"+languagePresets[language],
			"Toko: "+business.Name+" — "+business.Tagline,
		)
		if orderingEnabled || bookingEnabled {
			label := "Menu"
			empty := "- Belum ada menu yang dikonfigurasi."
			if bookingEnabled {
				label, empty = "Treatment", "- Belum ada treatment yang dikonfigurasi."
			}
			body := productLines
			if body == "" {
				body = empty
			}
			sections = append(sections, label+":\n"+body)
		}
		knowledgeBody := knowledgeLines
		if knowledgeBody == "" {
			knowledgeBody = "- Belum ada entri pengetahuan yang dikonfigurasi."
		}
		sections = append(sections, "Pengetahuan:\n"+knowledgeBody)
		if strings.TrimSpace(behavioral) != "" {
			sections = append(sections, "Aturan perilaku:\n"+strings.TrimSpace(behavioral))
		}
		toolsSection := toolInstructions
		if toolsSection == "" {
			toolsSection = defaultToolsID
		}
		if orderingEnabled && !bookingEnabled {
			toolsSection += "\n\n" + foodCheckoutClosingID
		}
		sections = append(sections, toolsSection)
	}

	if voiceSpeakingStyle != "" {
		sections = append(sections, voiceSpeakingStyle)
	}

	return strings.Join(sections, "\n\n")
}

func defaultToolsTextEN(orderingEnabled, bookingEnabled bool) string {
	switch {
	case bookingEnabled:
		return "Use tools to list treatments, check availability, and book appointments.\n" +
			"Confirm treatment, date, time, customer name, and phone before calling book_appointment.\n" +
			"Speak naturally like a real salon receptionist."
	case orderingEnabled:
		return "Use tools to look up products, update the order, and confirm when the customer is ready.\n" +
			"Call add_to_order only after the customer clearly confirms an item (e.g. \"yes\", \"add it\", \"that's correct\"). " +
			"Do not call add_to_order while they are still browsing, comparing options, or only stating a preference without confirming.\n" +
			"When the customer adds items via the menu screen, those items are already in the basket — do not call add_to_order for them.\n" +
			"If the customer asks to remove one item, call remove_from_order.\n" +
			"If the customer asks to cancel the whole order, start over, or clear the basket, call cancel_order.\n" +
			"After confirm_order succeeds, close the order in this order:\n" +
			"1. Ask any checkout extras first (loyalty card, upsell, or other questions from your knowledge base) — one topic per turn.\n" +
			"2. Always ask for the customer's name last — in its own separate turn, immediately before payment.\n" +
			"3. The name question must be the only question in that turn — never combine it with loyalty card, upsell, or any other question.\n" +
			"4. In that same turn as the standalone name question, call prompt_payment to prepare checkout.\n" +
			"5. When the customer answers with their name, call set_customer_name immediately — the Pay your order screen opens then.\n" +
			"Never call prompt_payment before confirm_order or before finishing checkout questions.\n" +
			"Never ask for the name before loyalty card or other checkout questions.\n" +
			"Never bundle the name question with any other question.\n" +
			"Speak naturally like a real cashier."
	default:
		return "Answer customer questions clearly using the business knowledge base.\n" +
			"Do not offer to take orders, add items, or process payments.\n" +
			"If asked about products or purchases, explain that this assistant focuses on answering questions.\n" +
			"Keep responses warm, concise, and helpful.\n" +
			"When the customer has no more questions or says goodbye:\n" +
			"1. Give a brief warm closing in one sentence.\n" +
			"2. Call end_conversation with reason \"question_answered\", \"patient_goodbye\", or \"out_of_scope\".\n" +
			"Do NOT call end_conversation if they only said \"thank you\" — ask if they have more questions first.\n" +
			"If you asked whether they have more questions and they clearly decline (\"no\", \"tidak\", \"cukup\", \"sudah\") or thank you (\"terima kasih\", \"thanks\"), call end_conversation immediately.\n" +
			"Never speak tool calls out loud. Do not say call.end_conversation or similar — invoke the tool silently.\n" +
			"Do NOT keep the conversation open after a clear goodbye."
	}
}

func defaultToolsTextID(orderingEnabled, bookingEnabled bool) string {
	switch {
	case bookingEnabled:
		return "Gunakan tools untuk melihat treatment, cek ketersediaan jadwal, dan membuat appointment.\n" +
			"Konfirmasi treatment, tanggal, jam, nama, dan nomor telepon pelanggan sebelum memanggil book_appointment.\n" +
			"Berbicaralah secara natural seperti resepsionis salon sungguhan."
	case orderingEnabled:
		return "Gunakan tools untuk mencari produk, memperbarui pesanan, dan mengonfirmasi saat pelanggan siap.\n" +
			"Panggil add_to_order hanya setelah pelanggan jelas mengonfirmasi item (misalnya \"iya\", \"tambahkan\", \"betul\"). " +
			"Jangan panggil add_to_order saat mereka masih browsing, membandingkan pilihan, atau hanya menyebut preferensi tanpa konfirmasi.\n" +
			"Saat pelanggan menambahkan item lewat layar menu, item tersebut sudah ada di keranjang — jangan panggil add_to_order untuk item itu.\n" +
			"Jika pelanggan minta hapus satu item, panggil remove_from_order.\n" +
			"Jika pelanggan minta batalkan seluruh pesanan, mulai ulang, atau kosongkan keranjang, panggil cancel_order.\n" +
			"Setelah confirm_order berhasil, tutup pesanan dengan urutan ini:\n" +
			"1. Tanyakan hal checkout lain dulu (kartu loyalitas, upsell, atau pertanyaan dari basis pengetahuan) — satu topik per turn.\n" +
			"2. Selalu tanyakan nama pelanggan terakhir — di turn terpisah, tepat sebelum pembayaran.\n" +
			"3. Pertanyaan nama harus satu-satunya pertanyaan di turn itu — jangan gabungkan dengan kartu loyalitas, upsell, atau pertanyaan lain.\n" +
			"4. Di turn yang sama dengan pertanyaan nama standalone, panggil prompt_payment untuk menyiapkan checkout.\n" +
			"5. Saat pelanggan menjawab dengan nama mereka, segera panggil set_customer_name — layar Bayar pesanan Anda terbuka saat itu.\n" +
			"Jangan panggil prompt_payment sebelum confirm_order atau sebelum selesai menanyakan hal checkout lain.\n" +
			"Jangan tanyakan nama sebelum kartu loyalitas atau pertanyaan checkout lainnya.\n" +
			"Jangan gabungkan pertanyaan nama dengan pertanyaan lain.\n" +
			"Berbicaralah secara natural seperti kasir sungguhan di Indonesia."
	default:
		return "Jawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis.\n" +
			"Jangan menawarkan untuk menerima pesanan, menambahkan item, atau memproses pembayaran.\n" +
			"Jika ditanya tentang produk atau pembelian, jelaskan bahwa asisten ini fokus menjawab pertanyaan.\n" +
			"Tetap ramah, ringkas, dan membantu.\n" +
			"Saat pelanggan tidak ada pertanyaan lagi atau mengucapkan selamat tinggal:\n" +
			"1. Berikan penutup singkat yang hangat dalam satu kalimat.\n" +
			"2. Panggil end_conversation dengan reason \"question_answered\", \"patient_goodbye\", atau \"out_of_scope\".\n" +
			"Jangan panggil end_conversation jika mereka hanya bilang \"terima kasih\" — tanyakan dulu apakah ada pertanyaan lain.\n" +
			"Jika kamu menanyakan apakah ada pertanyaan lain dan mereka menolak (\"tidak\", \"cukup\", \"sudah\") atau berterima kasih (\"terima kasih\", \"makasih\"), panggil end_conversation segera.\n" +
			"Jangan ucapkan tool call secara lisan. Jangan bilang call.end_conversation — panggil tool secara diam-diam.\n" +
			"Jangan biarkan percakapan terbuka setelah salam perpisahan yang jelas."
	}
}
