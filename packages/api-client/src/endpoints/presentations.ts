import type { HttpClient } from "../http";
import { PresentationSchema, PresentationListSchema, type Presentation, type PresentationDetail, PresentationDetailSchema, type Slide, SlideListSchema } from "../schemas/presentations";
import { z } from "zod";

export async function listDecks(http: HttpClient, businessId: string): Promise<Presentation[]> {
  const data = await http.get(`/admin/businesses/${businessId}/presentations`);
  return PresentationListSchema.parse(data);
}

export async function uploadDeck(http: HttpClient, businessId: string, presentationId: string, file: File): Promise<any> {
  return await http.upload(`/admin/businesses/${businessId}/presentations/${presentationId}/files`, file);
}

export async function deleteDeck(http: HttpClient, businessId: string, presentationId: string): Promise<void> {
  await http.delete(`/admin/businesses/${businessId}/presentations/${presentationId}`);
}

export async function getSlides(http: HttpClient, businessId: string, presentationId: string): Promise<PresentationDetail> {
  const data = await http.get(`/admin/businesses/${businessId}/presentations/${presentationId}`);
  return PresentationDetailSchema.parse(data);
}

export async function triggerNarration(http: HttpClient, businessId: string, presentationId: string): Promise<Presentation> {
  const data = await http.post(`/admin/businesses/${businessId}/presentations/${presentationId}/process`);
  return PresentationSchema.parse(data);
}
