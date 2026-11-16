import type { Clickhouse } from "@roost/clickhouse";
import type { storage } from "@roost/core";
import type { Db } from "@roost/db";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { AuthDeps } from "./auth-config.ts";
import { errorResponse, onError } from "./http/errors.ts";
import { adminRoutes } from "./routes/admin/index.ts";
import { healthRoutes } from "./routes/health.ts";
import { v1Routes } from "./routes/v1/index.ts";

/** Postgres for relational data, ClickHouse for events. */
/** `ai.fetch` is injected in tests so they never call OpenRouter. */
export type AppDeps = {
  db: Db;
  ch: Clickhouse;
  auth: AuthDeps;
  /** Attachment bytes (S3-compatible; in-memory in tests). */
  storage: storage.Storage;
  ai: { apiKey: string | undefined; fetch?: typeof fetch };
  /** Linear API calls; `fetch` is injected in tests. `dashboardUrl` is linked from created Linear issues. */
  linear: { fetch?: typeof fetch; dashboardUrl: string | undefined };
};

export function createApp(deps: AppDeps) {
  return new Hono()
    .use(requestId())
    .route("/", healthRoutes)
    .route("/v1", v1Routes(deps))
    .route("/admin", adminRoutes(deps))
    .notFound((c) => errorResponse(c, "not_found", "No such route"))
    .onError(onError);
}
