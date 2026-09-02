import type { HttpClient } from "../http";
import { AuthResponseSchema, type AuthResponse } from "../schemas/auth";
import { z } from "zod";

export async function signIn(http: HttpClient, email: string, password: string): Promise<AuthResponse> {
  const data = await http.post("/admin/auth/login", { email, password });
  return AuthResponseSchema.parse(data);
}

export async function signUp(http: HttpClient, email: string, password: string, name?: string, country?: string): Promise<any> {
  const data = await http.post("/admin/auth/signup", { email, password, name, country });
  return data; // Using any for simplicity as it returns union type
}

export async function getProfile(http: HttpClient): Promise<any> {
  const data = await http.get("/admin/auth/me");
  return data;
}

export async function updateProfile(http: HttpClient, body: { country?: string }): Promise<any> {
  const data = await http.patch("/admin/auth/me", body);
  return data;
}
