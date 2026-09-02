import { z } from "zod";

export const ProductSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  name: z.string(),
  price: z.number(),
  discount_percent: z.number(),
  category: z.string(),
  description: z.string(),
  image_url: z.string(),
  is_active: z.boolean(),
  sort_order: z.number(),
  duration_min: z.number().optional(),
});

export type Product = z.infer<typeof ProductSchema>;
export const ProductListSchema = z.array(ProductSchema);
