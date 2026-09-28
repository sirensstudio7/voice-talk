import { Type } from "@google/genai";
import type { OrderStore } from "./order-store.js";
import { effectivePrice, formatIdr, formatOrderReadBack } from "./pricing.js";
import { buildBookingToolDeclarations } from "./booking-tools.js";
import { buildFaqToolDeclarations } from "./faq-tools.js";

export interface ProductInfo {
  id: string;
  name: string;
  price: number;
  discount_percent: number;
  category: string;
  description: string;
  image_url: string;
  duration_min?: number;
}

function salePrice(product: ProductInfo): number {
  return effectivePrice(product.price, product.discount_percent);
}

function withSpokenRecall(
  result: Record<string, unknown>,
  nextStep: string,
): Record<string, unknown> {
  const order = (result.order as Record<string, unknown> | undefined) ?? undefined;
  const say = formatOrderReadBack(order);
  if (!say) return result;
  return {
    ...result,
    say,
    next_step: nextStep,
  };
}

function findProduct(query: string, productList: ProductInfo[]) {
  const needle = query.toLowerCase().trim();
  return productList
    .filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.category.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.id.toLowerCase().includes(needle),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: salePrice(p),
      original_price: p.discount_percent > 0 ? p.price : null,
      discount_percent: p.discount_percent,
      category: p.category,
      description: p.description,
    }));
}

function resolveRemoveProductId(
  query: string,
  orderStore: OrderStore,
  productList: ProductInfo[],
): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const orderItems =
    ((orderStore.snapshot().items as Array<{ product_id: string; name: string }>) ?? []);

  if (orderItems.some((item) => item.product_id === trimmed)) {
    return trimmed;
  }

  const needle = trimmed.toLowerCase();
  const orderMatches = orderItems.filter((item) => item.name.toLowerCase().includes(needle));
  if (orderMatches.length === 1) {
    return orderMatches[0]!.product_id;
  }

  const menuMatches = findProduct(trimmed, productList);
  const inOrderMenuMatches = menuMatches.filter((match) =>
    orderItems.some((item) => item.product_id === match.id),
  );
  if (inOrderMenuMatches.length === 1) {
    return inOrderMenuMatches[0]!.id;
  }

  return null;
}

export function buildToolDeclarations(
  options: {
    orderingEnabled?: boolean;
    bookingEnabled?: boolean;
    faqEnabled?: boolean;
    photoMomentEnabled?: boolean;
    bookingStaff?: boolean;
  } = {},
) {
  if (options.bookingEnabled) {
    return buildBookingToolDeclarations({ includeStaff: Boolean(options.bookingStaff) });
  }

  if (options.faqEnabled) {
    return buildFaqToolDeclarations();
  }

  if (!options.orderingEnabled) {
    return [];
  }

  const photoMomentEnabled = Boolean(options.photoMomentEnabled);
  const photoConsentTool = {
    name: "set_photo_souvenir_consent",
    description:
      "Record whether the customer wants a souvenir photo. Call AFTER loyalty/other checkout questions, AFTER they answer the photo yes/no question, and BEFORE asking for their name or calling prompt_payment.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        consent: {
          type: Type.STRING,
          description: 'Use "yes" if they want a photo, "no" if they decline.',
        },
      },
      required: ["consent"],
    },
  };

  const declarations = [
    {
      name: "search_products",
      description: "Search menu items by name, category, or keyword.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Search term such as latte, pastry, or coffee.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "add_to_order",
      description:
        "Add a menu item to the customer's order. Call only after the customer clearly confirms the item by voice. Do not call for items the customer added via the menu screen. After success, speak the item name, its price, and the running total from the `say` field — never omit the price.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          product_id: { type: Type.STRING, description: "Product id from search_products." },
          quantity: { type: Type.INTEGER, description: "How many to add." },
        },
        required: ["product_id"],
      },
    },
    {
      name: "remove_from_order",
      description:
        "Remove one item or reduce its quantity from the order. Use when the customer asks to remove a specific item. You can pass the product id or the item name (for example 'cold brew').",
      parameters: {
        type: Type.OBJECT,
        properties: {
          product_id: {
            type: Type.STRING,
            description: "Product id or item name to remove.",
          },
          quantity: { type: Type.INTEGER, description: "Optional quantity to remove." },
        },
        required: ["product_id"],
      },
    },
    {
      name: "cancel_order",
      description:
        "Cancel and clear the entire order. Use when the customer wants to cancel everything, start over, or empty their basket.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    {
      name: "get_order_summary",
      description:
        "Get the current order items and total. Speak every item with its price and the total from the `say` field.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    {
      name: "confirm_order",
      description:
        "Confirm the order when the customer says the basket is correct or they are ready to checkout (e.g. sudah benar, oke, iya, that's right). Call this tool immediately in that turn — do not only speak a confirmation. Call before loyalty, photo, name, or payment questions.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    ...(photoMomentEnabled ? [photoConsentTool] : []),
    {
      name: "set_customer_name",
      description: photoMomentEnabled
        ? "Save the customer's name on the order receipt. Call ONLY after confirm_order, after loyalty/other checkout questions, after set_photo_souvenir_consent, after your standalone name question, and after the customer has spoken their name. The Pay your order screen opens automatically when this succeeds."
        : "Save the customer's name on the order receipt. Call ONLY after confirm_order, after all other checkout questions, after your standalone name question, and after the customer has spoken their name. The Pay your order screen opens automatically when this succeeds.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "The customer's name as they said it." },
        },
        required: ["name"],
      },
    },
    {
      name: "prompt_payment",
      description: photoMomentEnabled
        ? "Prepare the Pay your order screen after your standalone name question. Call in the SAME turn as that name question — after set_photo_souvenir_consent and all other checkout questions. The screen opens when set_customer_name succeeds. Never call before confirm_order, before the photo souvenir question, or while asking loyalty."
        : "Prepare the Pay your order screen after your standalone name question. Call in the SAME turn as that name question — after all other checkout questions are done. The screen opens when set_customer_name succeeds. Never call before confirm_order or while asking loyalty or other checkout questions.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
  ];

  return [{ functionDeclarations: declarations }];
}

export function buildToolMapping(
  orderStore: OrderStore,
  productList: ProductInfo[],
  callbacks: {
    onConfirm?: (order: Record<string, unknown>) => void;
    onSetCustomerName?: (name: string) => void;
    onPhotoConsent?: (consent: "yes" | "no") => void;
    orderingEnabled?: boolean;
    photoMomentEnabled?: boolean;
  } = {},
): Record<string, (args: Record<string, unknown>) => Record<string, unknown>> {
  if (!callbacks.orderingEnabled) {
    return {};
  }

  const photoMomentEnabled = Boolean(callbacks.photoMomentEnabled);
  let photoConsent: "yes" | "no" | null = null;

  const photoRequiredError =
    "Smart Photo Moment is active. If the customer already answered the souvenir photo yes/no, call set_photo_souvenir_consent with that answer now — do not ask again. Otherwise ask the photo question once, then call set_photo_souvenir_consent. Then ask for the name alone with prompt_payment. Never re-confirm the order.";

  const nextStepAfterConfirm = (): string => {
    const noRestart =
      "CRITICAL: Do NOT re-confirm the order. Do NOT repeat loyalty, photo, or any checkout question the customer already answered in this conversation. ";

    if (photoMomentEnabled && photoConsent === null) {
      return (
        noRestart +
        "Order is confirmed. Do NOT call prompt_payment yet. " +
        "If loyalty was already answered, skip it. " +
        "If they already answered the souvenir photo yes/no, call set_photo_souvenir_consent with that answer immediately without asking again. " +
        "Otherwise ask the photo question once, then call set_photo_souvenir_consent. " +
        "Only after photo consent is saved, ask for the name alone with prompt_payment."
      );
    }
    if (photoMomentEnabled && photoConsent !== null) {
      return (
        noRestart +
        "Order is confirmed. Photo consent already recorded — do not ask about the photo again. " +
        "If loyalty was already answered, skip it. " +
        "Next: ask for the customer's name alone (once) and call prompt_payment in that same turn."
      );
    }
    return (
      noRestart +
      "Order is confirmed. Do NOT call prompt_payment yet. " +
      "If loyalty was already answered, skip it. " +
      "Next unfinished step only: ask for the customer's name alone and call prompt_payment in that same turn. " +
      'GOOD: "Boleh tahu nama Anda?" + prompt_payment, then set_customer_name after they answer.'
    );
  };

  const ensureOrderConfirmed = ():
    | { ok: true }
    | { ok: false; error: Record<string, unknown> } => {
    const snapshot = orderStore.snapshot();
    if (snapshot.status === "confirmed") return { ok: true };
    const items = (snapshot.items as unknown[]) ?? [];
    if (!items.length) {
      return {
        ok: false,
        error: { error: "Cannot proceed — the order is empty. Add items first." },
      };
    }
    const result = orderStore.confirm();
    if (!result.success) {
      return { ok: false, error: result };
    }
    if (callbacks.onConfirm && result.order) {
      callbacks.onConfirm(result.order as Record<string, unknown>);
    }
    return { ok: true };
  };

  const mapping: Record<string, (args: Record<string, unknown>) => Record<string, unknown>> = {
    search_products: (args) => {
      const results = findProduct(String(args.query ?? ""), productList);
      return { results, count: results.length };
    },
    add_to_order: (args) => {
      let product = productList.find((p) => p.id === args.product_id);
      if (!product) {
        const matches = findProduct(String(args.product_id ?? ""), productList);
        if (matches.length === 1) {
          product = productList.find((p) => p.id === matches[0]!.id);
        } else {
          return { error: `Unknown product '${String(args.product_id)}'.` };
        }
      }
      const added = orderStore.addItem(
        product!.id,
        product!.name,
        salePrice(product!),
        Math.max(1, Number(args.quantity ?? 1)),
        product!.image_url,
      );
      if ("error" in added) return added;
      const qty = Math.max(1, Number(args.quantity ?? 1));
      const unit = formatIdr(salePrice(product!));
      return withSpokenRecall(
        added,
        `Speak the added item WITH its price and the running total. ` +
          `Just added: ${qty}x ${product!.name} ${unit}. ` +
          `Read the \`say\` field out loud. Do not skip prices. Then ask if they want anything else.`,
      );
    },
    remove_from_order: (args) => {
      const query = String(args.product_id ?? "");
      const productId = resolveRemoveProductId(query, orderStore, productList);
      if (!productId) {
        return { error: `Could not find '${query}' in the current order.` };
      }
      const removed = orderStore.removeItem(productId, args.quantity as number | undefined);
      if ("error" in removed) return removed;
      return withSpokenRecall(
        removed,
        "Speak the updated basket WITH each item price and the new total from the `say` field.",
      );
    },
    cancel_order: () => orderStore.cancelOrder(),
    get_order_summary: () =>
      withSpokenRecall(
        { success: true, order: orderStore.snapshot() },
        "Read back every item WITH its price, then the total. Use the `say` field. Do not skip prices.",
      ),
    confirm_order: () => {
      const snapshot = orderStore.snapshot();
      if (snapshot.status === "confirmed") {
        return {
          success: true,
          already_confirmed: true,
          order: snapshot,
          next_step: nextStepAfterConfirm(),
        };
      }
      const result = orderStore.confirm();
      if (result.success && callbacks.onConfirm && result.order) {
        callbacks.onConfirm(result.order as Record<string, unknown>);
      }
      if (result.success) {
        return {
          ...result,
          next_step: nextStepAfterConfirm(),
        };
      }
      return result;
    },
    set_customer_name: (args) => {
      const ensured = ensureOrderConfirmed();
      if (!ensured.ok) return ensured.error;
      if (photoMomentEnabled && photoConsent === null) {
        return { error: photoRequiredError };
      }
      const result = orderStore.setCustomerName(String(args.name ?? ""));
      if (result.success && callbacks.onSetCustomerName) {
        callbacks.onSetCustomerName(String(args.name ?? ""));
      }
      return result;
    },
    prompt_payment: () => {
      const ensured = ensureOrderConfirmed();
      if (!ensured.ok) return ensured.error;
      if (photoMomentEnabled && photoConsent === null) {
        return { error: photoRequiredError };
      }
      return {
        success: true,
        prompt_payment: true,
        order: orderStore.snapshot(),
      };
    },
  };

  if (photoMomentEnabled) {
    mapping.set_photo_souvenir_consent = (args) => {
      const raw = String(args.consent ?? "")
        .trim()
        .toLowerCase();
      if (raw !== "yes" && raw !== "no") {
        return { error: 'consent must be "yes" or "no".' };
      }

      // If the model asked photo before calling confirm_order, confirm silently
      // so we do not force a spoken "mohon konfirmasi pesanan lagi" loop.
      const ensured = ensureOrderConfirmed();
      if (!ensured.ok) return ensured.error;

      const snapshot = orderStore.snapshot();
      if (photoConsent !== null) {
        const nameAlreadySet = Boolean(String(snapshot.customer_name ?? "").trim());
        return {
          success: true,
          consent: photoConsent,
          already_recorded: true,
          next_step: nameAlreadySet
            ? "Photo consent already saved. Do not ask about the photo, loyalty, or name again. Do not re-confirm the order."
            : "Photo consent already saved. Do not ask about the photo or re-confirm the order. Ask for the customer's name alone (once) and call prompt_payment in that same turn.",
        };
      }
      photoConsent = raw;
      callbacks.onPhotoConsent?.(raw);
      const nameAlreadySet = Boolean(String(snapshot.customer_name ?? "").trim());
      return {
        success: true,
        consent: raw,
        order: snapshot,
        next_step: nameAlreadySet
          ? "Photo consent saved. Customer name is already on the order — do not ask for the name again or re-confirm the order."
          : "Photo consent saved. Do NOT re-confirm the order. Do NOT ask loyalty or photo again. Now ask for the customer's name alone as the ONLY question and call prompt_payment in that same turn. After they answer, call set_customer_name.",
      };
    };
  }

  return mapping;
}
