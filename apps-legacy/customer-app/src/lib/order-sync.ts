export type OrderSyncAction =
  | {
      type: "order.add_item";
      item: {
        product_id: string;
        name: string;
        price: number;
        image_url?: string;
      };
      quantity?: number;
    }
  | { type: "order.decrement_item"; product_id: string }
  | { type: "order.remove_item"; product_id: string };

type OrderSyncHandler = (action: OrderSyncAction) => void;

let orderSyncHandler: OrderSyncHandler | null = null;
const pendingLocalAdds = new Set<string>();

export function isPendingLocalAdd(productId: string): boolean {
  return pendingLocalAdds.has(productId);
}

export function acknowledgeServerOrder(productIds: string[]): void {
  for (const productId of productIds) {
    pendingLocalAdds.delete(productId);
  }
}

export function clearPendingLocalAdds(): void {
  pendingLocalAdds.clear();
}

export function registerOrderSyncHandler(handler: OrderSyncHandler): void {
  orderSyncHandler = handler;
}

export function unregisterOrderSyncHandler(): void {
  orderSyncHandler = null;
}

export function emitOrderSync(action: OrderSyncAction): void {
  if (action.type === "order.add_item") {
    pendingLocalAdds.add(action.item.product_id);
  } else if (action.type === "order.remove_item") {
    pendingLocalAdds.delete(action.product_id);
  }
  orderSyncHandler?.(action);
}
