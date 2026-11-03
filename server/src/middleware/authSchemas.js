import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email address.");
const passwordSchema = z.string()
  .min(12, "Use a password with at least 12 characters.")
  .max(128, "Password cannot exceed 128 characters.");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required."),
  password: z.string().min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resendVerificationSchema = z.object({ email: emailSchema });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
