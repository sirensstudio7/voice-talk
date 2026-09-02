import { z } from "zod";

export const OrderItemSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  price: z.number(),
  quantity: z.number(),
  subtotal: z.number(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  total: z.number(),
  customer_name: z.string().nullable().optional(),
  created_at: z.string(),
  confirmed_at: z.string().nullable(),
  items: z.array(OrderItemSchema),
});

export type Order = z.infer<typeof OrderSchema>;
export const OrderListSchema = z.array(OrderSchema);
