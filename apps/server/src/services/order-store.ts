type OrderStatus = "open" | "confirmed";

interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url: string;
}

interface Order {
  items: OrderItem[];
  status: OrderStatus;
  customer_name: string | null;
}

export class OrderStore {
  private order: Order = { items: [], status: "open", customer_name: null };

  reset(): void {
    this.order = { items: [], status: "open", customer_name: null };
  }

  snapshot(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      status: this.order.status,
      items: this.order.items.map((item) => ({
        product_id: item.product_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: Math.round(item.price * item.quantity * 100) / 100,
        image_url: item.image_url,
      })),
      total: Math.round(this.total * 100) / 100,
    };
    if (this.order.customer_name) {
      payload.customer_name = this.order.customer_name;
    }
    return payload;
  }

  get total(): number {
    return this.order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  loadSnapshot(payload: Record<string, unknown>): void {
    const items: OrderItem[] = [];
    for (const raw of (payload.items as unknown[]) ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      items.push({
        product_id: String(item.product_id ?? ""),
        name: String(item.name ?? ""),
        price: Number(item.price ?? 0),
        quantity: Number(item.quantity ?? 0),
        image_url: String(item.image_url ?? ""),
      });
    }

    let status = String(payload.status ?? "open") as OrderStatus;
    if (status !== "open" && status !== "confirmed") status = "open";

    const customerName = payload.customer_name;
    this.order = {
      items,
      status,
      customer_name:
        customerName != null && String(customerName).trim()
          ? String(customerName).trim()
          : null,
    };
  }

  addItem(
    productId: string,
    name: string,
    price: number,
    quantity = 1,
    imageUrl = "",
  ): Record<string, unknown> {
    if (this.order.status === "confirmed") {
      return { error: "Order is already confirmed." };
    }

    for (const item of this.order.items) {
      if (item.product_id === productId) {
        item.quantity += quantity;
        if (imageUrl && !item.image_url) item.image_url = imageUrl;
        return { success: true, order: this.snapshot() };
      }
    }

    this.order.items.push({
      product_id: productId,
      name,
      price,
      quantity,
      image_url: imageUrl,
    });
    return { success: true, order: this.snapshot() };
  }

  removeItem(productId: string, quantity?: number): Record<string, unknown> {
    if (this.order.status === "confirmed") {
      return { error: "Order is already confirmed." };
    }

    const index = this.order.items.findIndex((item) => item.product_id === productId);
    if (index === -1) {
      return { error: `Product '${productId}' not found in order.` };
    }

    const item = this.order.items[index]!;
    if (quantity === undefined || quantity >= item.quantity) {
      this.order.items.splice(index, 1);
    } else {
      item.quantity -= quantity;
    }
    return { success: true, order: this.snapshot() };
  }

  cancelOrder(): Record<string, unknown> {
    if (this.order.status === "confirmed") {
      return { error: "Order is already confirmed." };
    }
    this.order.items = [];
    this.order.customer_name = null;
    return { success: true, order: this.snapshot() };
  }

  setCustomerName(name: string): Record<string, unknown> {
    const trimmed = name.trim();
    if (!trimmed) return { error: "Customer name cannot be empty." };
    this.order.customer_name = trimmed;
    return { success: true, order: this.snapshot() };
  }

  confirm(): Record<string, unknown> {
    if (!this.order.items.length) {
      return { error: "Cannot confirm an empty order." };
    }
    this.order.status = "confirmed";
    return { success: true, order: this.snapshot() };
  }
}
