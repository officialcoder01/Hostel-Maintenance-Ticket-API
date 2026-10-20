import { z } from "zod";

const fullName = z.string().trim().min(1, "Full name is required.").max(100);
const email = z.string().trim().toLowerCase().email("Must be a valid email address.");
const password = z.string().min(8, "Password must be at least 8 characters.").max(72);

export const registerSchema = z.object({
  fullName,
  email,
  password,
}).strict();

export const loginSchema = z.object({
  email,
  password,
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
