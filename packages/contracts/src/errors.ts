import { z } from "zod";

/** Every error response from Roost has exactly this shape. */
export const ErrorCodeSchema = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "payload_too_large",
  "internal",
  // Added with the AI proxy (additive, /v1-safe):
  "unavailable",
  "upstream_error",
]);

export const ErrorBodySchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string() }),
});

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
