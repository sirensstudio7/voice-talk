import { Type } from "@google/genai";
import type { OrderStore } from "./order-store.js";
import { effectivePrice } from "./pricing.js";
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
  } = {},
) {
  if (options.bookingEnabled) {
    return buildBookingToolDeclarations();
  }

  if (options.faqEnabled) {
    return buildFaqToolDeclarations();
  }

  if (!options.orderingEnabled) {
    return [];
  }

  return [
    {
      functionDeclarations: [
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
            "Add a menu item to the customer's order. Call only after the customer clearly confirms the item by voice. Do not call for items the customer added via the menu screen.",
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
          description: "Get the current order items and total.",
          parameters: { type: Type.OBJECT, properties: {} },
        },
        {
          name: "confirm_order",
          description: "Confirm the order when the customer is ready to checkout.",
          parameters: { type: Type.OBJECT, properties: {} },
        },
        {
          name: "set_customer_name",
          description:
            "Save the customer's name on the order receipt. Call ONLY after confirm_order, after all other checkout questions, after your standalone name question, and after the customer has spoken their name. The Pay your order screen opens automatically when this succeeds.",
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
          description:
            "Prepare the Pay your order screen after your standalone name question. Call in the SAME turn as that name question — after all other checkout questions are done. The screen opens when set_customer_name succeeds. Never call before confirm_order or while asking loyalty or other checkout questions.",
          parameters: { type: Type.OBJECT, properties: {} },
        },
      ],
    },
  ];
}

export function buildToolMapping(
  orderStore: OrderStore,
  productList: ProductInfo[],
  callbacks: {
    onConfirm?: (order: Record<string, unknown>) => void;
    onSetCustomerName?: (name: string) => void;
    orderingEnabled?: boolean;
  } = {},
): Record<string, (args: Record<string, unknown>) => Record<string, unknown>> {
  if (!callbacks.orderingEnabled) {
    return {};
  }

  return {
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
      return orderStore.addItem(
        product!.id,
        product!.name,
        salePrice(product!),
        Math.max(1, Number(args.quantity ?? 1)),
        product!.image_url,
      );
    },
    remove_from_order: (args) => {
      const query = String(args.product_id ?? "");
      const productId = resolveRemoveProductId(query, orderStore, productList);
      if (!productId) {
        return { error: `Could not find '${query}' in the current order.` };
      }
      return orderStore.removeItem(productId, args.quantity as number | undefined);
    },
    cancel_order: () => orderStore.cancelOrder(),
    get_order_summary: () => orderStore.snapshot() as Record<string, unknown>,
    confirm_order: () => {
      const result = orderStore.confirm();
      if (result.success && callbacks.onConfirm && result.order) {
        callbacks.onConfirm(result.order as Record<string, unknown>);
      }
      if (result.success) {
        return {
          ...result,
          next_step:
            "Order confirmed. Do NOT call prompt_payment yet. Ask loyalty card and any other checkout questions from your knowledge first — one topic per turn, one question only per turn. Then ask for the customer's name alone as the ONLY question in that turn and call prompt_payment in that same turn to prepare checkout. Wait for their answer, then call set_customer_name — the Pay your order screen opens then. BAD: \"Punya kartu loyalitas? Boleh tahu nama?\" GOOD: \"Boleh tahu nama Anda?\" + prompt_payment, then set_customer_name after they answer.",
        };
      }
      return result;
    },
    set_customer_name: (args) => {
      const snapshot = orderStore.snapshot();
      if (snapshot.status !== "confirmed") {
        return {
          error:
            "Confirm the order first, complete loyalty and other checkout questions, ask for the customer's name alone with prompt_payment, then call set_customer_name when they answer.",
        };
      }
      const result = orderStore.setCustomerName(String(args.name ?? ""));
      if (result.success && callbacks.onSetCustomerName) {
        callbacks.onSetCustomerName(String(args.name ?? ""));
      }
      return result;
    },
    prompt_payment: () => {
      const snapshot = orderStore.snapshot();
      if (snapshot.status !== "confirmed") {
        return {
          error:
            "Order is not confirmed yet. Call confirm_order first, complete checkout questions, ask for the customer's name alone with prompt_payment, then call set_customer_name when they answer.",
        };
      }
      return { success: true, prompt_payment: true };
    },
  };
}
