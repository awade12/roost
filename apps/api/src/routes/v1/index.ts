import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppDeps } from "../../app.ts";
import { aiRoutes } from "./ai.ts";
import { crashRoutes } from "./ingest/crashes.ts";
import { eventRoutes } from "./ingest/events.ts";
import { reportRoutes } from "./ingest/reports.ts";
import { minidumpRoutes } from "./ingest/minidumps.ts";
import { debugFileRoutes } from "./debug-files.ts";
import { configRoutes } from "./config.ts";
import { manageRoutes } from "./manage/index.ts";
import { queryRoutes } from "./query/index.ts";

/**
 * Public game API. ADDITIVE CHANGES ONLY: never rename, remove, or add a
 * required field here. Old game builds stay installed for years.
 * Rate limits are per key and per game (settings), applied in `requireKey`.
 */
export function v1Routes(deps: AppDeps) {
  return new Hono()
    .use(cors({ origin: "*", allowHeaders: ["content-type", "x-roost-key", "x-filename", "if-none-match"], exposeHeaders: ["etag"] }))
    .route("/", eventRoutes(deps))
    .route("/", aiRoutes(deps))
    .route("/", crashRoutes(deps))
    .route("/", reportRoutes(deps))
    .route("/", minidumpRoutes(deps))
    .route("/", debugFileRoutes(deps))
    .route("/", configRoutes(deps))
    .route("/", manageRoutes(deps))
    .route("/", queryRoutes(deps));
}
