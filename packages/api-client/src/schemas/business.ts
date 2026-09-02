import { z } from "zod";

export const BusinessSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  voice_name: z.string(),
  gemini_model: z.string(),
  background_url: z.string().optional(),
  is_active: z.boolean(),
  business_type: z.string().optional(),
  primary_use_case: z.string().optional(),
  onboarding_completed: z.boolean().optional(),
  capabilities: z.any().optional(), // Using any for BusinessCapabilities for simplicity, can type it properly later if needed
});

export type Business = z.infer<typeof BusinessSchema>;
export const BusinessListSchema = z.array(BusinessSchema);

export const AppearanceSettingsSchema = z.object({
  background_url: z.string(),
  gradient_color: z.string(),
  display_orientation: z.enum(["portrait", "landscape", "auto"]),
});

export type AppearanceSettings = z.infer<typeof AppearanceSettingsSchema>;
