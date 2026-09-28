import { AiLanguage } from "@/types/voice";

type PlaceholderContext = {
  language: AiLanguage;
  orderingEnabled: boolean;
  bookingEnabled: boolean;
  faqMode: boolean;
  businessType?: string;
};

export function getTranscriptPlaceholder({
  language,
  orderingEnabled,
  bookingEnabled,
  faqMode,
  businessType,
}: PlaceholderContext): string {
  const isIndonesian = language === "id";

  if (bookingEnabled) {
    return isIndonesian
      ? "Tahan mic dan ucapkan sesuatu seperti \"Saya mau booking treatment hari Sabtu pagi.\""
      : "Hold the mic and say something like \"I'd like to book a treatment for Saturday morning.\"";
  }

  if (businessType === "clinic") {
    return isIndonesian
      ? "Tahan mic dan tanyakan sesuatu seperti \"Saya butuh informasi tentang rumah sakit.\""
      : "Hold the mic and ask something like \"I need information about the hospital.\"";
  }

  if (orderingEnabled) {
    if (businessType === "retail") {
      return isIndonesian
        ? "Tahan mic dan ucapkan sesuatu seperti \"Saya mau beli dua kemeja ukuran medium.\""
        : "Hold the mic and say something like \"I'd like to buy two shirts, size medium.\"";
    }

    return isIndonesian
      ? "Tahan mic dan ucapkan sesuatu seperti \"Saya mau latte dan croissant.\""
      : "Hold the mic and say something like \"I'd like a latte and a croissant.\"";
  }

  if (businessType === "salon") {
    return isIndonesian
      ? "Tahan mic dan tanyakan sesuatu seperti \"Treatment apa saja yang tersedia?\""
      : "Hold the mic and ask something like \"What treatments do you offer?\"";
  }

  if (faqMode) {
    if (businessType === "saas") {
      return isIndonesian
        ? "Tahan mic dan tanyakan sesuatu seperti \"Apa itu Lorescale?\""
        : 'Hold the mic and ask something like "What is Lorescale?"';
    }

    return isIndonesian
      ? "Tahan mic dan tanyakan sesuatu seperti \"Jam buka sampai jam berapa?\""
      : "Hold the mic and ask something like \"What are your opening hours?\"";
  }

  return isIndonesian
    ? "Tahan mic dan mulai percakapan dengan asisten AI."
    : "Hold the mic and start a conversation with the AI assistant.";
}

export type StudioSuggestionChip = {
  id: string;
  label: string;
  text: string;
};

/** 1–2 sendText shortcuts derived from the same copy as the empty-transcript hint. */
export function getStudioSuggestionChips({
  language,
  orderingEnabled,
  bookingEnabled,
  faqMode,
  businessType,
}: PlaceholderContext): StudioSuggestionChip[] {
  const isIndonesian = language === "id";

  if (bookingEnabled) {
    return [
      {
        id: "book",
        label: isIndonesian ? "Booking" : "Book",
        text: isIndonesian
          ? "Saya mau booking treatment hari Sabtu pagi."
          : "I'd like to book a treatment for Saturday morning.",
      },
    ];
  }

  if (businessType === "clinic") {
    return [
      {
        id: "info",
        label: isIndonesian ? "Info" : "Info",
        text: isIndonesian
          ? "Saya butuh informasi tentang rumah sakit."
          : "I need information about the hospital.",
      },
    ];
  }

  if (orderingEnabled) {
    if (businessType === "retail") {
      return [
        {
          id: "order",
          label: isIndonesian ? "Belanja" : "Shop",
          text: isIndonesian
            ? "Saya mau beli dua kemeja ukuran medium."
            : "I'd like to buy two shirts, size medium.",
        },
      ];
    }

    return [
      {
        id: "order",
        label: isIndonesian ? "Pesan" : "Order",
        text: isIndonesian
          ? "Saya mau latte dan croissant."
          : "I'd like a latte and a croissant.",
      },
    ];
  }

  if (businessType === "salon") {
    return [
      {
        id: "treatments",
        label: isIndonesian ? "Treatment" : "Treatments",
        text: isIndonesian
          ? "Treatment apa saja yang tersedia?"
          : "What treatments do you offer?",
      },
    ];
  }

  if (faqMode && businessType === "saas") {
    return [
      {
        id: "product",
        label: isIndonesian ? "Info produk" : "Product info",
        text: isIndonesian ? "Apa itu Lorescale?" : "What is Lorescale?",
      },
    ];
  }

  if (faqMode) {
    return [
      {
        id: "hours",
        label: isIndonesian ? "Jam buka" : "Hours",
        text: isIndonesian
          ? "Jam buka sampai jam berapa?"
          : "What are your opening hours?",
      },
    ];
  }

  return [];
}
