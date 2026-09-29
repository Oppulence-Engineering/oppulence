import { z } from "zod";

export const WorkOSLoginQuerySchema = z.object({
  return_to: z.string().optional(),
  // Only the literal 0 is forwarded. Any other value is a normal sign-in,
  // so a caller cannot use this route to skip the hosted picker.
  max_age: z.literal("0").optional(),
});

export const WorkOSCallbackQuerySchema = z.object({
  error: z.string().optional(),
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
});

export const LogoutQuerySchema = z.object({
  return_to: z.string().optional(),
});
