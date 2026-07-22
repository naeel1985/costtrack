import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), "Include upper- and lower-case letters")
  .refine((v) => /[0-9]/.test(v), "Include a number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Include a symbol");

export const usernameSchema = z
  .string()
  .min(3, "At least 3 characters")
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only");

export const registerSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name").max(120),
    username: usernameSchema,
    email: z.string().email("Enter a valid email").max(200),
    phone: z
      .string()
      .max(30)
      .regex(/^[+()\d\s-]*$/, "Enter a valid phone number")
      .optional()
      .or(z.literal("")),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your username or email"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifySchema = z.object({ token: z.string().min(10) });
export const resendSchema = z.object({ email: z.string().email() });

// ── Password reset ───────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email").max(200),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    email: z.string().email("Enter a valid email").max(200),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
    // Accepted in any cosmetic form; normalised before use.
    recoveryCode: z.string().min(1, "Enter your recovery code").max(64),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
