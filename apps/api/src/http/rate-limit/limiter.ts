import type { Context, MiddlewareHandler } from "hono";
import { AppError } from "./errors.ts";

type LimiterOptions = { limit: number; windowMs: number };

/**
 * Fixed-window, in-memory counter. Fine for one API process; swap for a
 * Postgres-backed one before running more than one API replica.
 */
export function createLimiter({ limit, windowMs }: LimiterOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Counts a hit; throws `rate_limited` once `key` is over the limit (`override` replaces it per call). */
    hit(key: string, override?: number): void {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size > 50_000) hits.clear(); // crude memory cap; a reset only loosens limits briefly
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return;
      }
      entry.count += 1;
      if (entry.count > (override ?? limit)) throw new AppError("rate_limited", "Too many requests. Try again later.");
    },
  };
}

export function rateLimit(options: LimiterOptions & { key: (c: Context) => string }): MiddlewareHandler {
  const limiter = createLimiter(options);
  return async (c, next) => {
    limiter.hit(options.key(c));
    await next();
  };
}

/**
 * Best-effort client IP, used only as a rate-limit key (never logged or stored).
 * In prod Caddy overwrites X-Forwarded-For with the real client address (it
 * ignores client-sent values unless trusted_proxies is set), so the first entry
 * is trustworthy there. In dev it is the Vite proxy or the test runner.
 */
export function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
