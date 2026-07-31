import { create } from "zustand";
import { mergeTranscriptChunk } from "@voicetalk/shared";

import {
  acknowledgeServerOrder,
  clearPendingLocalAdds,
  emitOrderSync,
  isPendingLocalAdd,
} from "@/lib/order-sync";
import { fetchMenu, type MenuResponse } from "@/lib/menu-api";
import { useKioskStore } from "@/store/kiosk-store";
import { DEFAULT_VISION_CONFIG } from "@/types/kiosk";
import {
  AiLanguage,
  CheckoutPhase,
  ConnectionStatus,
  ConversationPhase,
  OrderItem,
  OrderState,
  TranscriptMessage,
  emptyOrder,
} from "@/types/voice";
import { normalizeVoicePreset, type VoicePreset } from "@voicetalk/shared";

const LANGUAGE_STORAGE_KEY = "voicetalk-language";

function readStoredLanguage(): AiLanguage | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === "en" || stored === "id" ? stored : null;
}

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
      // Keep menu taps that haven't synced yet, but don't undo voice/UI removals.
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

export interface SelectedTreatment {
  productId: string;
  name: string;
  durationMin?: number;
  price?: number;
}

interface SessionStore {
  status: ConnectionStatus;
  isTalking: boolean;
  error: string | null;
  language: AiLanguage;
  transcript: TranscriptMessage[];
  order: OrderState;
  checkoutPhase: CheckoutPhase;
  checkoutOpenRequest: number;
  checkoutPanelOpen: boolean;
  menuPanelOpen: boolean;
  freshOrderRequest: number;
  paymentCompleteRequest: number;
  /** Smart Photo Moment consent captured before name/payment. */
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
  conversationPhase: ConversationPhase;
  bookingPanelOpen: boolean;
  selectedTreatment: SelectedTreatment | null;
  assistantName: string;
  avatarUrl: string;
  avatarModelPath: string;
  avatarCacheBust: number;
  voicePreset: VoicePreset;
  forceNewAssistantBubble: boolean;
  setStatus: (status: ConnectionStatus) => void;
  setCheckoutPanelOpen: (open: boolean) => void;
  openCheckoutPanel: () => void;
  closeCheckoutPanel: () => void;
  setMenuPanelOpen: (open: boolean) => void;
  openMenuPanel: () => void;
  closeMenuPanel: () => void;
  setBookingPanelOpen: (open: boolean) => void;
  openBookingPanel: (treatment: SelectedTreatment) => void;
  closeBookingPanel: () => void;
  setTalking: (isTalking: boolean) => void;
  setError: (error: string | null) => void;
  setLanguage: (language: AiLanguage) => void;
  addTranscript: (role: "user" | "assistant", text: string) => void;
  setAssistantDisplayText: (text: string) => void;
  markAssistantTurnBoundary: () => void;
  setOrder: (order: OrderState, options?: { source?: "server" | "local" }) => void;
  revealPaymentAfterNamePrompt: () => void;
  confirmOrder: () => void;
  /** Menu / tap checkout: confirm and open Pay your order (no voice name ask). */
  confirmManualCheckout: () => void;
  markPaid: () => void;
  expirePayment: () => void;
  setPhotoSouvenirConsent: (consent: "yes" | "no" | null) => void;
  startNewOrder: () => void;
  startNewConversation: () => void;
  clearTranscript: () => void;
  setConversationPhase: (phase: ConversationPhase) => void;
  addItemToOrder: (
    item: Pick<OrderItem, "product_id" | "name" | "price">,
    quantity?: number,
    options?: { fromRect?: DOMRectReadOnly; imageUrl?: string; animate?: boolean },
  ) => void;
  enqueueFlyAnimation: (
    payload: Omit<FlyAnimationRequest, "id"> & { count?: number },
  ) => void;
  completeFlyAnimation: (id: string) => void;
  setMenuProductMeta: (products: Record<string, MenuProductMeta>) => void;
  setMenuCache: (slug: string, menu: MenuResponse) => void;
  refreshMenuCache: (slug: string) => Promise<boolean>;
  setAssistantName: (name: string) => void;
  setAvatarUrl: (url: string) => void;
  setAvatarModelPath: (path: string) => void;
  setVoicePreset: (preset: VoicePreset | string | null | undefined) => void;
  hydrateLanguageFromStorage: () => void;
  decrementItemFromOrder: (productId: string) => void;
  removeItemFromOrder: (productId: string) => void;
  setItemNote: (productId: string, note: string) => void;
  reset: (options?: { keepTranscript?: boolean }) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  status: "idle",
  isTalking: false,
  error: null,
  language: "id",
  transcript: [],
  order: emptyOrder(),
  checkoutPhase: "shopping",
  checkoutOpenRequest: 0,
  checkoutPanelOpen: false,
  menuPanelOpen: false,
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
  conversationPhase: "complete",
  bookingPanelOpen: false,
  selectedTreatment: null,
  assistantName: "Lorescale",
  avatarUrl: "",
  avatarModelPath: "",
  avatarCacheBust: 0,
  voicePreset: "natural",
  forceNewAssistantBubble: false,
  setStatus: (status) => set({ status }),
  setCheckoutPanelOpen: (open) => set({ checkoutPanelOpen: open }),
  openCheckoutPanel: () => set({ checkoutPanelOpen: true }),
  closeCheckoutPanel: () => set({ checkoutPanelOpen: false }),
  setMenuPanelOpen: (open) => set({ menuPanelOpen: open }),
  openMenuPanel: () => set({ menuPanelOpen: true }),
  closeMenuPanel: () => set({ menuPanelOpen: false }),
  setBookingPanelOpen: (open) => set({ bookingPanelOpen: open }),
  openBookingPanel: (treatment) =>
    set({
      selectedTreatment: treatment,
      bookingPanelOpen: true,
      menuPanelOpen: false,
    }),
  closeBookingPanel: () =>
    set({
      bookingPanelOpen: false,
      selectedTreatment: null,
    }),
  setTalking: (isTalking) => set({ isTalking }),
  setError: (error) => set({ error }),
  setLanguage: (language) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
    set({ language });
  },
  addTranscript: (role, text) =>
    set((state) => {
      if (!text.trim()) return state;

      const last = state.transcript[state.transcript.length - 1];
      if (last && last.role === role) {
        const merged = mergeTranscriptChunk(last.text, text);
        if (merged === last.text) return state;

        return {
          transcript: state.transcript.map((message, index) =>
            index === state.transcript.length - 1
              ? { ...message, text: merged }
              : message,
          ),
        };
      }

      return {
        transcript: [
          ...state.transcript,
          { id: crypto.randomUUID(), role, text: text.trimStart() },
        ],
      };
    }),
  setAssistantDisplayText: (text) =>
    set((state) => {
      const last = state.transcript[state.transcript.length - 1];
      let nextTranscript: TranscriptMessage[];
      const startNewBubble =
        state.forceNewAssistantBubble || last?.role !== "assistant";

      if (!startNewBubble && last?.role === "assistant") {
        if (last.text === text) {
          nextTranscript = state.transcript;
        } else {
          nextTranscript = state.transcript.map((message, index) =>
            index === state.transcript.length - 1
              ? { ...message, text }
              : message,
          );
        }
      } else if (!text) {
        return state;
      } else {
        nextTranscript = [
          ...state.transcript,
          { id: crypto.randomUUID(), role: "assistant", text },
        ];
      }

      return {
        transcript: nextTranscript,
        forceNewAssistantBubble: false,
      };
    }),
  markAssistantTurnBoundary: () => set({ forceNewAssistantBubble: true }),
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

      const paymentPatch =
        customerNameJustSet && state.checkoutPhase !== "paid"
          ? applyCustomerNamePaymentReveal({
              ...state,
              order: nextOrder,
              flyAnimations,
              pendingCheckoutReveal,
            })
          : state.pendingNamePaymentReveal &&
              nextOrder.customer_name?.trim() &&
              state.checkoutPhase !== "paid"
            ? applyCustomerNamePaymentReveal({
                ...state,
                order: nextOrder,
                flyAnimations,
                pendingCheckoutReveal,
              })
            : null;

      if (
        paymentPatch &&
        "pendingCheckoutReveal" in paymentPatch &&
        typeof paymentPatch.pendingCheckoutReveal === "boolean"
      ) {
        pendingCheckoutReveal = paymentPatch.pendingCheckoutReveal;
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
        const paymentPatch = tryRevealPaymentModal(state);
        return paymentPatch ?? state;
      }

      // Standalone name question asked — wait for set_customer_name before opening Pay modal.
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
      // Already confirmed but stuck on shopping (e.g. prior menu confirm without payment reveal).
      if (state.checkoutPhase === "awaiting_payment") {
        return state.checkoutPanelOpen
          ? state
          : {
              checkoutPanelOpen: true,
              checkoutOpenRequest: state.checkoutOpenRequest + 1,
            };
      }
      if (state.checkoutPhase !== "shopping") return state;

      const order = { ...state.order, status: "confirmed" as const };
      // Force payment UI open — menu checkout has no voice name ask.
      return {
        order,
        checkoutPhase: "awaiting_payment" as const,
        checkoutPanelOpen: true,
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
    set((state) => ({
      status: "idle",
      isTalking: false,
      error: null,
      transcript: [],
      order: emptyOrder(),
      checkoutPhase: "shopping",
      checkoutPanelOpen: false,
      menuPanelOpen: false,
      pendingCheckoutReveal: false,
      pendingNamePaymentReveal: false,
      checkoutOpenRequest: 0,
      flyAnimations: [],
      freshOrderRequest: state.freshOrderRequest + 1,
      paymentCompleteRequest: 0,
      photoSouvenirConsent: null,
    })),
  startNewConversation: () =>
    set({
      status: "idle",
      isTalking: false,
      error: null,
      transcript: [],
      conversationPhase: "complete",
      forceNewAssistantBubble: false,
    }),
  clearTranscript: () => set({ transcript: [] }),
  setConversationPhase: (conversationPhase) => set({ conversationPhase }),
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
      const paymentPatch = shouldRevealPaymentAfterAnimations({ ...state, flyAnimations })
        ? tryRevealPaymentModal({ ...state, flyAnimations })
        : null;

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
    useKioskStore.getState().setVisionConfig(menu.vision ?? DEFAULT_VISION_CONFIG);
    set((state) => {
      const menuProductMeta = menu.products.reduce<Record<string, MenuProductMeta>>(
        (meta, product) => {
          meta[product.id] = { name: product.name, image_url: product.image_url };
          return meta;
        },
        { ...state.menuProductMeta },
      );

      return {
        menuCache: menu,
        menuCacheSlug: slug,
        menuProductMeta,
        voicePreset: normalizeVoicePreset(menu.voice_preset),
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
    try {
      const menu = await fetchMenu(slug);
      get().setMenuCache(slug, menu);
      return true;
    } catch {
      return false;
    }
  },
  setAssistantName: (name) =>
    set({ assistantName: name.trim() || "Lorescale" }),
  setAvatarUrl: (url) =>
    set({ avatarUrl: url, avatarCacheBust: url ? Date.now() : 0 }),
  setAvatarModelPath: (path) => set({ avatarModelPath: path.trim() }),
  setVoicePreset: (preset) =>
    set({ voicePreset: normalizeVoicePreset(preset) }),
  hydrateLanguageFromStorage: () => {
    const stored = readStoredLanguage();
    if (stored) {
      set({ language: stored });
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
  reset: (options) => {
    clearPendingLocalAdds();
    return set((state) => ({
      status: "idle",
      isTalking: false,
      error: null,
      transcript: options?.keepTranscript ? state.transcript : [],
      order: emptyOrder(),
      checkoutPhase: "shopping",
      checkoutOpenRequest: 0,
      checkoutPanelOpen: false,
      menuPanelOpen: false,
      bookingPanelOpen: false,
      selectedTreatment: null,
      pendingCheckoutReveal: false,
      pendingNamePaymentReveal: false,
      flyAnimations: [],
      paymentCompleteRequest: 0,
      photoSouvenirConsent: null,
      conversationPhase: "active",
      forceNewAssistantBubble: false,
    }));
  },
}));
