import type { HttpClient } from "../http";
import { OrderSchema, OrderListSchema, type Order } from "../schemas/orders";
import { z } from "zod";

export async function listOrders(http: HttpClient, businessId: string, date?: string): Promise<Order[]> {
  const params = new URLSearchParams();
  if (date) {
    params.set("date", date);
    params.set("tz_offset", String(new Date().getTimezoneOffset()));
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const data = await http.get(`/admin/businesses/${businessId}/orders${query}`);
  return OrderListSchema.parse(data);
}

export async function getOrder(http: HttpClient, businessId: string, orderId: string): Promise<Order> {
  const data = await http.get(`/admin/businesses/${businessId}/orders/${orderId}`);
  return OrderSchema.parse(data);
}
