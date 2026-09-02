import { z } from "zod";

export const PresentationSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  language: z.string().optional(),
  category: z.string().optional(),
});

export type Presentation = z.infer<typeof PresentationSchema>;
export const PresentationListSchema = z.array(PresentationSchema);

export const SlideSchema = z.object({
  id: z.string(),
  presentation_id: z.string(),
  slide_number: z.number(),
  image_url: z.string().optional(),
  text_content: z.string().optional(),
});

export type Slide = z.infer<typeof SlideSchema>;
export const SlideListSchema = z.array(SlideSchema);

export const PresentationDetailSchema = PresentationSchema.extend({
  slides: SlideListSchema.optional(),
});

export type PresentationDetail = z.infer<typeof PresentationDetailSchema>;
