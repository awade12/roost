import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError } from "./errors.ts";

/** Rejects bodies over `bytes` with the standard error shape (413 payload_too_large). */
export function limitBody(bytes: number): MiddlewareHandler {
  return bodyLimit({
    maxSize: bytes,
    onError: () => {
      throw new AppError("payload_too_large", `Body over ${Math.round(bytes / 1024)} KB`);
    },
  });
}

export const ONE_MB = 1024 * 1024;
