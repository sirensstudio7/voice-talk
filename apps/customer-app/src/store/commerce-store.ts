import { create } from "zustand";
import { CheckoutPhase, OrderItem, OrderState, emptyOrder } from "@/types/voice";
import { useUiStore } from "./ui-store";

// TODO: import from proper location in new app
// import { MenuResponse } from "@/lib/menu-api";
type MenuResponse = any;

// TODO: import from proper order-sync module in new app
// import { acknowledgeServerOrder, clearPendingLocalAdds, emitOrderSync, isPendingLocalAdd } from "@/lib/order-sync";
function isPendingLocalAdd(id: string) { return true; }
function acknowledgeServerOrder(ids: string[]) {}
function emitOrderSync(payload: any) {}
function clearPendingLocalAdds() {}

export interface FlyAnimationRequest {
  id: string;
  productId: string;
  name: string;
  imageUrl?: string;
  fromRect?: DOMRectReadOnly;
}

export interface MenuProductMeta {
  name: string;
  image_url?: string;
}

export interface SelectedTreatment {
  productId: string;
  name: string;
  durationMin?: number;
  price?: number;
}

function diffAddedItems(
  previous: OrderItem[],
  next: OrderItem[],
): Pick<FlyAnimationRequest, "productId" | "name" | "imageUrl">[] {
  const added: Pick<FlyAnimationRequest, "productId" | "name" | "imageUrl">[] = [];

  for (const nextItem of next) {
    const previousItem = previous.find((item) => item.product_id === nextItem.product_id);
    const delta = nextItem.quantity - (previousItem?.quantity ?? 0);
    const imageUrl = nextItem.image_url;
    for (let i = 0; i < delta; i += 1) {
      added.push({ productId: nextItem.product_id, name: nextItem.name, imageUrl });
    }
  }

  return added;
}

function recalcTotal(items: OrderItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
}

function mergeServerOrder(server: OrderState, client: OrderState): OrderState {
  if (server.items.length === 0 && server.status === "open") {
    return server;
  }

  const byId = new Map<string, OrderItem>();

  for (const item of server.items) {
    byId.set(item.product_id, { ...item });
  }

  for (const clientItem of client.items) {
    const serverItem = byId.get(clientItem.product_id);
    if (!serverItem) {
      if (isPendingLocalAdd(clientItem.product_id)) {
        byId.set(clientItem.product_id, { ...clientItem });
      }
      continue;
    }

    if (clientItem.quantity > serverItem.quantity) {
      byId.set(clientItem.product_id, {
        ...serverItem,
        quantity: clientItem.quantity,
        subtotal: Math.round(serverItem.price * clientItem.quantity * 100) / 100,
        note: clientItem.note ?? serverItem.note,
        image_url: serverItem.image_url || clientItem.image_url,
      });
    } else if (clientItem.note && !serverItem.note) {
      byId.set(clientItem.product_id, { ...serverItem, note: clientItem.note });
    }
  }

  const items = Array.from(byId.values());
  return {
    ...server,
    items,
    total: recalcTotal(items),
    customer_name: server.customer_name ?? client.customer_name,
  };
}

function resolveImageUrl(
  productId: string,
  imageUrl: string | undefined,
  menuProductMeta: Record<string, MenuProductMeta>,
): string | undefined {
  return imageUrl || menuProductMeta[productId]?.image_url;
}

function buildFlyEntries(
  addedItems: Pick<FlyAnimationRequest, "productId" | "name" | "imageUrl">[],
  menuProductMeta: Record<string, MenuProductMeta>,
  fromRect?: DOMRectReadOnly,
): FlyAnimationRequest[] {
  return addedItems.map((item) => ({
    id: crypto.randomUUID(),
    productId: item.productId,
    name: item.name,
    imageUrl: resolveImageUrl(item.productId, item.imageUrl, menuProductMeta),
    fromRect,
  }));
}

function tryRevealPaymentModal(state: {
  order: OrderState;
  checkoutPhase: CheckoutPhase;
  checkoutOpenRequest: number;
  checkoutPanelOpen: boolean;
  flyAnimations: FlyAnimationRequest[];
}) {
  if (state.order.status !== "confirmed") return null;
  if (state.checkoutPhase === "paid") return null;

  if (state.checkoutPhase === "awaiting_payment") {
    if (state.checkoutPanelOpen) return null;
    return {
      checkoutPanelOpen: true,
      checkoutOpenRequest: state.checkoutOpenRequest + 1,
    };
  }

  if (state.flyAnimations.length > 0) {
    return { pendingCheckoutReveal: true };
  }

  return {
    checkoutPhase: "awaiting_payment" as const,
    checkoutPanelOpen: true,
    checkoutOpenRequest: state.checkoutOpenRequest + 1,
    pendingCheckoutReveal: false,
    pendingNamePaymentReveal: false,
  };
}

function applyCustomerNamePaymentReveal(state: {
  order: OrderState;
  checkoutPhase: CheckoutPhase;
  checkoutOpenRequest: number;
  checkoutPanelOpen: boolean;
  flyAnimations: FlyAnimationRequest[];
  pendingCheckoutReveal: boolean;
}) {
  if (state.order.status !== "confirmed") return null;
  if (!state.order.customer_name?.trim()) return null;
  if (state.checkoutPhase === "paid") return null;

  const paymentPatch = tryRevealPaymentModal(state);
  if (!paymentPatch) {
    return { pendingNamePaymentReveal: true };
  }

  return {
    ...paymentPatch,
    pendingNamePaymentReveal: false,
  };
}

function paymentRevealPatch(state: {
  order: OrderState;
  checkoutPhase: CheckoutPhase;
  checkoutOpenRequest: number;
  checkoutPanelOpen: boolean;
  flyAnimations: FlyAnimationRequest[];
  pendingCheckoutReveal: boolean;
}) {
  return tryRevealPaymentModal(state);
}

function shouldRevealPaymentAfterAnimations(state: {
  order: OrderState;
  pendingCheckoutReveal: boolean;
  pendingNamePaymentReveal: boolean;
  flyAnimations: FlyAnimationRequest[];
}) {
  if (state.flyAnimations.length > 0 || state.order.status !== "confirmed") {
    return false;
  }
  if (state.pendingCheckoutReveal) return true;
  return (
    state.pendingNamePaymentReveal && Boolean(state.order.customer_name?.trim())
  );
}

interface CommerceStore {
  order: OrderState;
  checkoutPhase: CheckoutPhase;
  checkoutOpenRequest: number;
  freshOrderRequest: number;
  paymentCompleteRequest: number;
  photoSouvenirConsent: "yes" | "no" | null;
  pendingCheckoutReveal: boolean;
  pendingNamePaymentReveal: boolean;
  flyAnimations: FlyAnimationRequest[];
  menuProductMeta: Record<string, MenuProductMeta>;
  menuCache: MenuResponse | null;
  menuCacheSlug: string | null;
  orderingEnabled: boolean;
  menuEnabled: boolean;
  bookingEnabled: boolean;
  faqMode: boolean;

  setOrder: (order: OrderState, options?: { source?: "server" | "local" }) => void;
  confirmOrder: () => void;
  confirmManualCheckout: () => void;
  markPaid: () => void;
  expirePayment: () => void;
  startNewOrder: () => void;
  addItemToOrder: (
    item: Pick<OrderItem, "product_id" | "name" | "price">,
    quantity?: number,
    options?: { fromRect?: DOMRectReadOnly; imageUrl?: string; animate?: boolean },
  ) => void;
  decrementItemFromOrder: (productId: string) => void;
  removeItemFromOrder: (productId: string) => void;
  setItemNote: (productId: string, note: string) => void;
  enqueueFlyAnimation: (
    payload: Omit<FlyAnimationRequest, "id"> & { count?: number },
  ) => void;
  completeFlyAnimation: (id: string) => void;
  setMenuProductMeta: (products: Record<string, MenuProductMeta>) => void;
  setMenuCache: (slug: string, menu: MenuResponse) => void;
  refreshMenuCache: (slug: string) => Promise<boolean>;
  setPhotoSouvenirConsent: (consent: "yes" | "no" | null) => void;
  revealPaymentAfterNamePrompt: () => void;
  reset: () => void;
}

export const useCommerceStore = create<CommerceStore>((set, get) => ({
  order: emptyOrder(),
  checkoutPhase: "shopping",
  checkoutOpenRequest: 0,
  freshOrderRequest: 0,
  paymentCompleteRequest: 0,
  photoSouvenirConsent: null,
  pendingCheckoutReveal: false,
  pendingNamePaymentReveal: false,
  flyAnimations: [],
  menuProductMeta: {},
  menuCache: null,
  menuCacheSlug: null,
  orderingEnabled: false,
  menuEnabled: false,
  bookingEnabled: false,
  faqMode: false,

  setOrder: (order, options) =>
    set((state) => {
      if (options?.source === "server") {
        acknowledgeServerOrder(order.items.map((item) => item.product_id));
      }
      const nextOrder =
        options?.source === "server" ? mergeServerOrder(order, state.order) : order;
      const orderEmptied =
        nextOrder.items.length === 0 &&
        nextOrder.status === "open" &&
        state.checkoutPhase !== "paid";
      const addedItems = diffAddedItems(state.order.items, nextOrder.items);
      const shouldAnimate = addedItems.length > 0 && state.checkoutPhase !== "paid";
      const flyAnimations = shouldAnimate
        ? [...state.flyAnimations, ...buildFlyEntries(addedItems, state.menuProductMeta)]
        : state.flyAnimations;
      let pendingCheckoutReveal = state.pendingCheckoutReveal;
      if (orderEmptied) {
        pendingCheckoutReveal = false;
      }

      const customerNameJustSet =
        options?.source === "server" &&
        nextOrder.status === "confirmed" &&
        Boolean(nextOrder.customer_name?.trim()) &&
        !Boolean(state.order.customer_name?.trim());

      const checkoutPanelOpen = useUiStore.getState().checkoutPanelOpen;

      const paymentPatch =
        customerNameJustSet && state.checkoutPhase !== "paid"
          ? applyCustomerNamePaymentReveal({
              ...state,
              order: nextOrder,
              flyAnimations,
              pendingCheckoutReveal,
              checkoutPanelOpen,
            })
          : state.pendingNamePaymentReveal &&
              nextOrder.customer_name?.trim() &&
              state.checkoutPhase !== "paid"
            ? applyCustomerNamePaymentReveal({
                ...state,
                order: nextOrder,
                flyAnimations,
                pendingCheckoutReveal,
                checkoutPanelOpen,
              })
            : null;

      if (
        paymentPatch &&
        "pendingCheckoutReveal" in paymentPatch &&
        typeof paymentPatch.pendingCheckoutReveal === "boolean"
      ) {
        pendingCheckoutReveal = paymentPatch.pendingCheckoutReveal;
      }
      
      if (paymentPatch && "checkoutPanelOpen" in paymentPatch) {
        if (paymentPatch.checkoutPanelOpen !== undefined) {
          useUiStore.getState().setCheckoutPanelOpen(paymentPatch.checkoutPanelOpen);
        }
        delete (paymentPatch as any).checkoutPanelOpen;
      }

      return {
        order: nextOrder,
        flyAnimations,
        pendingCheckoutReveal,
        checkoutPhase: orderEmptied ? "shopping" : state.checkoutPhase,
        ...(orderEmptied ? { pendingNamePaymentReveal: false } : {}),
        ...paymentPatch,
      };
    }),
  revealPaymentAfterNamePrompt: () =>
    set((state) => {
      if (state.order.status !== "confirmed") return state;
      if (state.checkoutPhase === "paid") return state;

      if (state.order.customer_name?.trim()) {
        const checkoutPanelOpen = useUiStore.getState().checkoutPanelOpen;
        const paymentPatch = tryRevealPaymentModal({ ...state, checkoutPanelOpen });
        if (paymentPatch && "checkoutPanelOpen" in paymentPatch) {
           if (paymentPatch.checkoutPanelOpen !== undefined) {
             useUiStore.getState().setCheckoutPanelOpen(paymentPatch.checkoutPanelOpen);
           }
           const { checkoutPanelOpen: _, ...rest } = paymentPatch;
           return rest;
        }
        return paymentPatch ?? state;
      }

      return { pendingNamePaymentReveal: true };
    }),
  confirmOrder: () =>
    set((state) => {
      if (state.order.items.length === 0 || state.checkoutPhase !== "shopping") return state;

      return {
        order: { ...state.order, status: "confirmed" },
      };
    }),
  confirmManualCheckout: () =>
    set((state) => {
      if (state.order.items.length === 0) return state;
      if (state.checkoutPhase === "paid") return state;
      
      const checkoutPanelOpen = useUiStore.getState().checkoutPanelOpen;
      
      if (state.checkoutPhase === "awaiting_payment") {
        if (!checkoutPanelOpen) {
          useUiStore.getState().setCheckoutPanelOpen(true);
          return { checkoutOpenRequest: state.checkoutOpenRequest + 1 };
        }
        return state;
      }
      if (state.checkoutPhase !== "shopping") return state;

      const order = { ...state.order, status: "confirmed" as const };
      useUiStore.getState().setCheckoutPanelOpen(true);
      return {
        order,
        checkoutPhase: "awaiting_payment" as const,
        checkoutOpenRequest: state.checkoutOpenRequest + 1,
        pendingCheckoutReveal: false,
        pendingNamePaymentReveal: false,
      };
    }),
  markPaid: () =>
    set((state) => ({
      checkoutPhase: "paid",
      paymentCompleteRequest: state.paymentCompleteRequest + 1,
    })),
  expirePayment: () =>
    set((state) => ({
      checkoutPhase: "shopping",
      order: { ...state.order, status: "open" },
    })),
  setPhotoSouvenirConsent: (consent) => set({ photoSouvenirConsent: consent }),
  startNewOrder: () =>
    set((state) => {
      useUiStore.getState().setCheckoutPanelOpen(false);
      useUiStore.getState().setMenuPanelOpen(false);
      return {
        order: emptyOrder(),
        checkoutPhase: "shopping",
        pendingCheckoutReveal: false,
        pendingNamePaymentReveal: false,
        checkoutOpenRequest: 0,
        flyAnimations: [],
        freshOrderRequest: state.freshOrderRequest + 1,
        paymentCompleteRequest: 0,
        photoSouvenirConsent: null,
      };
    }),
  addItemToOrder: (item, quantity = 1, options) => {
    let applied = false;
    set((state) => {
      if (state.order.status === "confirmed" || state.checkoutPhase !== "shopping") return state;

      applied = true;
      const existing = state.order.items.find((i) => i.product_id === item.product_id);
      const items = existing
        ? state.order.items.map((i) =>
            i.product_id === item.product_id
              ? {
                  ...i,
                  quantity: i.quantity + quantity,
                  subtotal: Math.round(i.price * (i.quantity + quantity) * 100) / 100,
                }
              : i,
          )
        : [
            ...state.order.items,
            {
              ...item,
              quantity,
              subtotal: Math.round(item.price * quantity * 100) / 100,
            },
          ];

      const shouldAnimate = options?.animate !== false;
      const imageUrl = resolveImageUrl(
        item.product_id,
        options?.imageUrl,
        state.menuProductMeta,
      );
      const flyAnimations = shouldAnimate
        ? [
            ...state.flyAnimations,
            ...Array.from({ length: quantity }, () => ({
              id: crypto.randomUUID(),
              productId: item.product_id,
              name: item.name,
              imageUrl,
              fromRect: options?.fromRect,
            })),
          ]
        : state.flyAnimations;

      return {
        order: { ...state.order, items, total: recalcTotal(items) },
        flyAnimations,
      };
    });

    if (applied) {
      emitOrderSync({
        type: "order.add_item",
        item: {
          product_id: item.product_id,
          name: item.name,
          price: item.price,
          image_url: options?.imageUrl,
        },
        quantity,
      });
    }
  },
  decrementItemFromOrder: (productId) => {
    let applied = false;
    set((state) => {
      if (state.order.status === "confirmed" || state.checkoutPhase !== "shopping") return state;

      applied = true;
      const items = state.order.items
        .map((i) => {
          if (i.product_id !== productId) return i;
          const quantity = i.quantity - 1;
          if (quantity <= 0) return null;
          return {
            ...i,
            quantity,
            subtotal: Math.round(i.price * quantity * 100) / 100,
          };
        })
        .filter((i): i is OrderItem => i !== null);

      return { order: { ...state.order, items, total: recalcTotal(items) } };
    });

    if (applied) {
      emitOrderSync({ type: "order.decrement_item", product_id: productId });
    }
  },
  removeItemFromOrder: (productId) => {
    let applied = false;
    set((state) => {
      if (state.order.status === "confirmed" || state.checkoutPhase !== "shopping") return state;

      applied = true;
      const items = state.order.items.filter((i) => i.product_id !== productId);
      return { order: { ...state.order, items, total: recalcTotal(items) } };
    });

    if (applied) {
      emitOrderSync({ type: "order.remove_item", product_id: productId });
    }
  },
  setItemNote: (productId, note) =>
    set((state) => {
      if (state.order.status === "confirmed" || state.checkoutPhase !== "shopping") return state;

      const trimmed = note.trim();
      const items = state.order.items.map((item) =>
        item.product_id === productId
          ? { ...item, note: trimmed || undefined }
          : item,
      );

      return { order: { ...state.order, items } };
    }),
  enqueueFlyAnimation: (payload) =>
    set((state) => {
      const count = payload.count ?? 1;
      const { count: _count, ...rest } = payload;

      return {
        flyAnimations: [
          ...state.flyAnimations,
          ...Array.from({ length: count }, () => ({
            id: crypto.randomUUID(),
            ...rest,
          })),
        ],
      };
    }),
  completeFlyAnimation: (id) =>
    set((state) => {
      const flyAnimations = state.flyAnimations.filter((animation) => animation.id !== id);
      const checkoutPanelOpen = useUiStore.getState().checkoutPanelOpen;
      const paymentPatch = shouldRevealPaymentAfterAnimations({ ...state, flyAnimations })
        ? tryRevealPaymentModal({ ...state, flyAnimations, checkoutPanelOpen })
        : null;
        
      if (paymentPatch && "checkoutPanelOpen" in paymentPatch) {
        if (paymentPatch.checkoutPanelOpen !== undefined) {
          useUiStore.getState().setCheckoutPanelOpen(paymentPatch.checkoutPanelOpen);
        }
        delete (paymentPatch as any).checkoutPanelOpen;
      }

      return {
        flyAnimations,
        pendingCheckoutReveal:
          paymentPatch && "pendingCheckoutReveal" in paymentPatch
            ? (paymentPatch.pendingCheckoutReveal ?? false)
            : paymentPatch
              ? false
              : state.pendingCheckoutReveal,
        pendingNamePaymentReveal:
          paymentPatch && "pendingNamePaymentReveal" in paymentPatch
            ? (paymentPatch.pendingNamePaymentReveal ?? false)
            : paymentPatch
              ? false
              : state.pendingNamePaymentReveal,
        ...paymentPatch,
      };
    }),
  setMenuProductMeta: (products) =>
    set((state) => ({
      menuProductMeta: { ...state.menuProductMeta, ...products },
    })),
  setMenuCache: (slug, menu) => {
    // TODO: implement setVisionConfig in new app
    // useKioskStore.getState().setVisionConfig(menu.vision ?? DEFAULT_VISION_CONFIG);
    set((state) => {
      const menuProductMeta = menu.products.reduce<Record<string, MenuProductMeta>>(
        (meta: Record<string, MenuProductMeta>, product: any) => {
          meta[product.id] = { name: product.name, image_url: product.image_url };
          return meta;
        },
        { ...state.menuProductMeta },
      );

      return {
        menuCache: menu,
        menuCacheSlug: slug,
        menuProductMeta,
        orderingEnabled: menu.capabilities?.ordering_enabled ?? true,
        menuEnabled:
          menu.capabilities?.menu_enabled ?? (menu.capabilities?.ordering_enabled ?? true),
        bookingEnabled: menu.capabilities?.booking_enabled ?? false,
        faqMode:
          !(menu.capabilities?.ordering_enabled ?? true) &&
          !(menu.capabilities?.booking_enabled ?? false),
      };
    });
  },
  refreshMenuCache: async (slug) => {
    // TODO: implement fetchMenu in new app
    // try {
    //   const menu = await fetchMenu(slug);
    //   get().setMenuCache(slug, menu);
    //   return true;
    // } catch {
    //   return false;
    // }
    return false;
  },
  reset: () => {
    clearPendingLocalAdds();
    return set(() => ({
      order: emptyOrder(),
      checkoutPhase: "shopping",
      checkoutOpenRequest: 0,
      pendingCheckoutReveal: false,
      pendingNamePaymentReveal: false,
      flyAnimations: [],
      paymentCompleteRequest: 0,
      photoSouvenirConsent: null,
    }));
  },
}));
