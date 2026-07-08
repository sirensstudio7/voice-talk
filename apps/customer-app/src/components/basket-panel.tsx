"use client";

import dynamic from "next/dynamic";
import { BookOpen, Mic, Minus, Pencil, Plus, ShoppingBasket, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { basketButtonRef } from "@/components/fly-to-basket";
import { slideOverBackdropClass, slideOverPanelClass, useSlideOver } from "@/components/slide-over";

import { OrderCompleteStep } from "@/components/order-complete-step";
import { PaymentStep } from "@/components/payment-step";
import { useBusinessSlug } from "@/context/business-context";
import { persistConfirmedOrder } from "@/lib/order-api";
import { useSessionStore } from "@/store/session-store";
import type { CheckoutPhase, OrderItem } from "@/types/voice";
import { formatCurrency } from "@voicetalk/shared";

const BasketModel3D = dynamic(
  () => import("@/components/basket-model-3d").then((mod) => ({ default: mod.BasketModel3D })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <ShoppingBasket className="h-8 w-8 animate-pulse text-orange-500" strokeWidth={1.75} />
      </div>
    ),
  },
);

function panelTitle(phase: CheckoutPhase): string {
  switch (phase) {
    case "awaiting_payment":
      return "Pay your order";
    case "paid":
      return "Order complete";
    default:
      return "Your Basket";
  }
}

function panelSubtitle(phase: CheckoutPhase, itemCount: number): string {
  switch (phase) {
    case "awaiting_payment":
      return "Scan the QR code to pay";
    case "paid":
      return "Payment acknowledged";
    default:
      return itemCount === 0 ? "Add items to get started" : `${itemCount} item${itemCount === 1 ? "" : "s"}`;
  }
}

function BasketEmptyState({ onBrowseMenu }: { onBrowseMenu: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-6">
      <div className="relative h-44 w-full">
        <BasketModel3D className="h-full w-full" />
      </div>

      <div className="mt-5 text-center">
        <p className="text-[22px] font-semibold tracking-tight text-slate-900">Start your order</p>
        <p className="mx-auto mt-2 max-w-[320px] text-[15px] leading-relaxed text-slate-500">
          Browse the menu or tell Lorescale what you want. Items you add show up here.
        </p>
      </div>

      <div className="mt-10 w-full space-y-4">
        <button
          type="button"
          onClick={onBrowseMenu}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 py-3.5 text-[15px] font-semibold text-white transition hover:bg-orange-600 active:scale-[0.99]"
          style={{
            boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
          }}
        >
          <BookOpen className="h-4 w-4" strokeWidth={2.25} />
          Open menu
        </button>

        <p className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400">
          <Mic className="h-3.5 w-3.5" strokeWidth={2.25} />
          Or hold the mic on the main screen
        </p>
      </div>
    </div>
  );
}

interface BasketItemRowProps {
  item: OrderItem;
  imageUrl?: string;
  canEdit: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  onSetNote: (note: string) => void;
}

function BasketItemRow({
  item,
  imageUrl,
  canEdit,
  onDecrement,
  onIncrement,
  onSetNote,
}: BasketItemRowProps) {
  const [imageError, setImageError] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(item.note ?? "");
  const showImage = imageUrl && !imageError;

  const saveNote = () => {
    onSetNote(draftNote);
    setIsEditingNote(false);
  };

  return (
    <li className="py-4 first:pt-1 last:pb-1">
      <div className="flex items-center gap-3.5">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-200/50">
          {showImage ? (
            <Image
              src={imageUrl}
              alt={item.name}
              fill
              sizes="56px"
              className="object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 text-xl">
              ☕
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-slate-900">
            {item.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatCurrency(item.price)} each</p>
          {item.note && !isEditingNote ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.note}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <p className="text-[15px] font-bold tabular-nums tracking-tight text-slate-900">
            {formatCurrency(item.subtotal)}
          </p>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDecrement}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                aria-label={`Remove one ${item.name}`}
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
              <span className="min-w-[1.25rem] select-none text-center text-sm font-bold tabular-nums text-slate-900">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={onIncrement}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm shadow-orange-200/60 transition hover:bg-orange-600 active:scale-95"
                aria-label={`Add one ${item.name}`}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
              Qty {item.quantity}
            </span>
          )}
        </div>

        {canEdit ? (
          <>
            <div className="h-10 w-px shrink-0 bg-slate-200" aria-hidden />
            <button
              type="button"
              onClick={() => {
                setDraftNote(item.note ?? "");
                setIsEditingNote((open) => !open);
              }}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
                item.note || isEditingNote
                  ? "border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100"
                  : "border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50"
              }`}
              aria-label={item.note ? "Edit note" : "Add note"}
            >
              <Pencil className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </>
        ) : null}
      </div>

      {isEditingNote ? (
        <div className="mt-3 pl-[4.375rem]">
          <textarea
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            onBlur={saveNote}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                saveNote();
              }
              if (event.key === "Escape") {
                setDraftNote(item.note ?? "");
                setIsEditingNote(false);
              }
            }}
            rows={2}
            placeholder="Add a note (e.g. less sugar, less ice, oat milk)"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-200"
            autoFocus
          />
        </div>
      ) : null}
    </li>
  );
}

export function CheckoutPanel() {
  const businessSlug = useBusinessSlug();
  const {
    order,
    checkoutPhase,
    checkoutPanelOpen,
    confirmOrder,
    markPaid,
    expirePayment,
    startNewOrder,
    closeCheckoutPanel,
    openMenuPanel,
    addItemToOrder,
    decrementItemFromOrder,
    removeItemFromOrder,
    setItemNote,
  } = useSessionStore();
  const menuProductMeta = useSessionStore((s) => s.menuProductMeta);

  const { mounted, isRendered, isVisible } = useSlideOver(checkoutPanelOpen);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const canEdit = checkoutPhase === "shopping" && order.status !== "confirmed";
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const handleConfirmOrder = async () => {
    if (order.items.length === 0 || checkoutPhase !== "shopping" || isConfirming) return;

    setIsConfirming(true);
    setConfirmError(null);

    try {
      await persistConfirmedOrder(businessSlug, order);
      confirmOrder();
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "Could not confirm order.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    closeCheckoutPanel();
  };

  const handleNewOrder = () => {
    startNewOrder();
  };

  const handleBrowseMenu = () => {
    closeCheckoutPanel();
    openMenuPanel();
  };

  if (!mounted || !isRendered) return null;

  return createPortal(
    <>
      <button
        type="button"
        className={`${slideOverBackdropClass(isVisible)} z-[200]`}
        onClick={handleClose}
        aria-label="Close checkout"
      />

      <aside
        className={`${slideOverPanelClass(isVisible, "z-[210] overflow-hidden bg-white")}`}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              {panelTitle(checkoutPhase)}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{panelSubtitle(checkoutPhase, itemCount)}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="Close checkout panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-5 pb-4">
          {checkoutPhase === "awaiting_payment" ? (
            <PaymentStep order={order} onPaid={markPaid} onExpired={expirePayment} />
          ) : checkoutPhase === "paid" ? (
            <OrderCompleteStep order={order} onNewOrder={handleNewOrder} />
          ) : order.items.length === 0 ? (
            <BasketEmptyState onBrowseMenu={handleBrowseMenu} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <BasketItemRow
                  key={item.product_id}
                  item={item}
                  imageUrl={menuProductMeta[item.product_id]?.image_url}
                  canEdit={canEdit}
                  onDecrement={() => {
                    if (item.quantity <= 1) {
                      removeItemFromOrder(item.product_id);
                    } else {
                      decrementItemFromOrder(item.product_id);
                    }
                  }}
                  onIncrement={() =>
                    addItemToOrder(
                      {
                        product_id: item.product_id,
                        name: item.name,
                        price: item.price,
                      },
                      1,
                      { animate: false },
                    )
                  }
                  onSetNote={(note) => setItemNote(item.product_id, note)}
                />
              ))}
            </ul>
          )}
        </div>

        {checkoutPhase === "shopping" && order.items.length > 0 ? (
          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-end justify-between">
              <span className="text-sm text-slate-500">Total</span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
                {formatCurrency(order.total)}
              </span>
            </div>
            {confirmError ? (
              <p className="mb-3 text-sm text-red-600" role="alert">
                {confirmError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleConfirmOrder()}
              disabled={isConfirming}
              className="inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: "rgb(63, 111, 248)",
                boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
              }}
            >
              {isConfirming ? "Confirming…" : "Confirm order"}
            </button>
          </div>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}

export function BasketButton() {
  const { order, checkoutPhase, checkoutOpenRequest, openCheckoutPanel } = useSessionStore();

  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (checkoutOpenRequest > 0) {
      openCheckoutPanel();
    }
  }, [checkoutOpenRequest, openCheckoutPanel]);

  return (
    <button
      ref={(node) => {
        basketButtonRef.current = node;
      }}
      type="button"
      data-basket-target
      onClick={openCheckoutPanel}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
      aria-label={`Basket${itemCount > 0 ? `, ${itemCount} items` : ""}`}
    >
      <ShoppingBasket className="h-4 w-4" />
      {itemCount > 0 && checkoutPhase === "shopping" ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </button>
  );
}
