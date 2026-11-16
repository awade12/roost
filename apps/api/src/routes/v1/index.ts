import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppDeps } from "../../app.ts";
import { rateLimit } from "../../http/rate-limit.ts";
import { aiRoutes } from "./ai.ts";
import { crashRoutes } from "./crashes.ts";
import { eventRoutes } from "./events.ts";

/**
 * Public game API. ADDITIVE CHANGES ONLY: never rename, remove, or add a
 * required field here. Old game builds stay installed for years.
 */
export function v1Routes(deps: AppDeps) {
  return new Hono()
    .use(cors({ origin: "*", allowHeaders: ["content-type", "x-roost-key", "x-filename"] }))
    .use(rateLimit({ limit: 120, windowMs: 60_000, key: (c) => c.req.header("x-roost-key") ?? "anon" }))
    .route("/", eventRoutes(deps))
    .route("/", aiRoutes(deps))
    .route("/", crashRoutes(deps));
}
