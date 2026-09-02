import type { HttpClient } from "../http";
import { BusinessSchema, BusinessListSchema, type Business } from "../schemas/business";
import { z } from "zod";

export async function listUserBusinesses(http: HttpClient): Promise<Business[]> {
  const data = await http.get("/admin/businesses");
  return BusinessListSchema.parse(data);
}

export async function createBusiness(http: HttpClient, body: { name: string; slug: string }): Promise<Business> {
  const data = await http.post("/admin/businesses", body);
  return BusinessSchema.parse(data);
}

export async function deleteBusiness(http: HttpClient, businessId: string): Promise<void> {
  await http.delete(`/admin/businesses/${businessId}`);
}

export async function checkSlug(http: HttpClient, slug: string): Promise<any> {
  const data = await http.get(`/admin/businesses/check-slug?slug=${encodeURIComponent(slug)}`);
  return data;
}

export async function completeOnboarding(
  http: HttpClient,
  businessId: string,
  body: {
    business_type: string;
    primary_use_case: "orders" | "faqs" | "both" | "appointments";
    language?: "id" | "en";
  }
): Promise<any> {
  const data = await http.patch(`/admin/businesses/${businessId}/onboarding`, body);
  return data;
}
