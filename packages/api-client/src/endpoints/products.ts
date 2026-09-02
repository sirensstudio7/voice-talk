import type { HttpClient } from "../http";
import { ProductSchema, ProductListSchema, type Product } from "../schemas/products";
import { z } from "zod";

export async function listProducts(http: HttpClient, businessId: string): Promise<Product[]> {
  const data = await http.get(`/admin/businesses/${businessId}/products`);
  return ProductListSchema.parse(data);
}

export async function createProduct(http: HttpClient, businessId: string, body: Partial<Product>): Promise<Product> {
  const data = await http.post(`/admin/businesses/${businessId}/products`, body);
  return ProductSchema.parse(data);
}

export async function updateProduct(http: HttpClient, businessId: string, id: string, body: Partial<Product>): Promise<Product> {
  const data = await http.patch(`/admin/businesses/${businessId}/products/${id}`, body);
  return ProductSchema.parse(data);
}

export async function deleteProduct(http: HttpClient, businessId: string, id: string): Promise<void> {
  await http.delete(`/admin/businesses/${businessId}/products/${id}`);
}

export async function uploadProductImage(http: HttpClient, businessId: string, file: File): Promise<{ image_url: string }> {
  return await http.upload<{ image_url: string }>(`/admin/businesses/${businessId}/product-images`, file);
}
