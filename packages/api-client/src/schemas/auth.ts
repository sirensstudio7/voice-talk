import { z } from "zod";

export const AuthResponseSchema = z.object({
  access_token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    country: z.string().optional(),
  }),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;
