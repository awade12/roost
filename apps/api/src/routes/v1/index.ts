import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppDeps } from "../../app.ts";
import { aiRoutes } from "./ai.ts";
import { crashRoutes } from "./crashes.ts";
import { eventRoutes } from "./events.ts";
import { reportRoutes } from "./reports.ts";

/**
 * Public game API. ADDITIVE CHANGES ONLY: never rename, remove, or add a
 * required field here. Old game builds stay installed for years.
 * Rate limits are per key and per game (settings), applied in `requireKey`.
 */
export function v1Routes(deps: AppDeps) {
  return new Hono()
    .use(cors({ origin: "*", allowHeaders: ["content-type", "x-roost-key", "x-filename"] }))
    .route("/", eventRoutes(deps))
    .route("/", aiRoutes(deps))
    .route("/", crashRoutes(deps))
    .route("/", reportRoutes(deps));
}
