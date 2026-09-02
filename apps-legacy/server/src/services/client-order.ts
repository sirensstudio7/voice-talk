import type { OrderStore } from "./order-store.js";

function formatBasketSummary(order: Record<string, unknown>, language: string): string {
  const items = (order.items as Array<Record<string, unknown>>) ?? [];
  if (!items.length) return language === "en" ? "empty" : "kosong";

  const parts = items.map(
    (item) => `${Number(item.quantity ?? 1)}x ${String(item.name ?? "").trim()}`,
  );
  return parts.filter((p) => p.trim() && !p.startsWith("0x")).join(", ");
}

function buildMenuAddPrompt(
  name: string,
  quantity: number,
  language: string,
  order: Record<string, unknown> | null,
): string {
  const itemLabel = quantity !== 1 ? `${quantity} ${name}` : `1 ${name}`;
  const basketSummary = formatBasketSummary(order ?? {}, language);
  const confirmExample =
    language === "en"
      ? quantity === 1
        ? `Added one ${name.toLowerCase()}`
        : `Added ${itemLabel.toLowerCase()}`
      : quantity === 1
        ? `Satu ${name.toLowerCase()} sudah ditambahkan`
        : `${itemLabel} sudah ditambahkan`;

  if (language === "en") {
    return (
      `The customer just added ${itemLabel} using the menu screen. ` +
      `Current basket: ${basketSummary}. ` +
      "Briefly confirm the menu add in one short natural sentence " +
      `(for example: "${confirmExample}"). ` +
      "Do not call add_to_order for this item — it is already in the basket. " +
      "Do not add items from earlier voice conversation unless the customer clearly " +
      "confirms they still want them. " +
      "If they previously mentioned other items by voice that are not in the basket, " +
      "you may ask once whether they still want those."
    );
  }
  return (
    `Pelanggan baru saja menambahkan ${itemLabel} lewat layar menu. ` +
    `Keranjang saat ini: ${basketSummary}. ` +
    "Konfirmasi penambahan dari menu dengan singkat dalam satu kalimat natural " +
    `(misalnya: "${confirmExample}"). ` +
    "Jangan panggil add_to_order untuk item ini — sudah ada di keranjang. " +
    "Jangan tambahkan item dari percakapan suara sebelumnya kecuali pelanggan " +
    "jelas mengonfirmasi masih menginginkannya. " +
    "Jika mereka sebelumnya menyebut item lain lewat suara yang belum ada di keranjang, " +
    "boleh tanyakan sekali apakah masih diinginkan."
  );
}

export async function handleClientOrderMessage(
  msgType: string,
  payload: Record<string, unknown>,
  orderStore: OrderStore,
  sendOrderUpdate: (order: Record<string, unknown>) => Promise<void>,
  options: {
    notifyAssistant?: (text: string) => Promise<void>;
    language?: string;
  } = {},
): Promise<void> {
  let result: Record<string, unknown> | null = null;
  let addedName: string | null = null;
  let addedQuantity = 1;
  const language = options.language ?? "id";

  if (msgType === "order.add_item") {
    const item = (payload.item as Record<string, unknown>) ?? {};
    addedName = String(item.name ?? "").trim() || null;
    addedQuantity = Number(payload.quantity ?? item.quantity ?? 1);
    result = orderStore.addItem(
      String(item.product_id ?? ""),
      String(item.name ?? ""),
      Number(item.price ?? 0),
      addedQuantity,
      String(item.image_url ?? ""),
    );
  } else if (msgType === "order.decrement_item") {
    result = orderStore.removeItem(String(payload.product_id ?? ""), 1);
  } else if (msgType === "order.remove_item") {
    result = orderStore.removeItem(String(payload.product_id ?? ""));
  }

  if (result?.order) {
    await sendOrderUpdate(result.order as Record<string, unknown>);
    if (
      msgType === "order.add_item" &&
      addedName &&
      options.notifyAssistant &&
      !("error" in result)
    ) {
      await options.notifyAssistant(
        buildMenuAddPrompt(addedName, addedQuantity, language, result.order as Record<string, unknown>),
      );
    }
  }
}
