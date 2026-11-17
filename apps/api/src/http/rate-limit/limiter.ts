import { createHash } from "node:crypto";
import type { Context } from "hono";
import { AppError } from "../errors.ts";
import type { RateStore } from "./stores.ts";

type LimiterOptions = {
  /** Keeps limiters apart in the shared store, e.g. "otp-ip". */
  name: string;
  limit: number;
  windowMs: number;
};

/**
 * Fixed-window limiter over a store (Postgres in production, so all API replicas share counts).
 * Keys are hashed with the limiter name before they reach the store: emails and IPs are never kept.
 */
export function createLimiter(store: RateStore, { name, limit, windowMs }: LimiterOptions) {
  return {
    /** Counts a hit; throws `rate_limited` once `key` is over the limit (`override` replaces it per call). */
    async hit(key: string, override?: number): Promise<void> {
      const id = createHash("sha256").update(`${name}\0${key}`).digest("hex");
      const count = await store.hit(id, windowMs);
      if (count > (override ?? limit)) throw new AppError("rate_limited", "Too many requests. Try again later.");
    },
  };
}

/**
 * Best-effort client IP, used only as a rate-limit key (hashed, never logged or stored).
 * In prod Caddy overwrites X-Forwarded-For with the real client address (it
 * ignores client-sent values unless trusted_proxies is set), so the first entry
 * is trustworthy there. In dev it is the Vite proxy or the test runner.
 */
export function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
