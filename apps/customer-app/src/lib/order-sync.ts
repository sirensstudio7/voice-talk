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

export function registerOrderSyncHandler(handler: OrderSyncHandler): void {
  orderSyncHandler = handler;
}

export function unregisterOrderSyncHandler(): void {
  orderSyncHandler = null;
}

export function emitOrderSync(action: OrderSyncAction): void {
  orderSyncHandler?.(action);
}
