import { Hono } from "hono";
import type { AppDeps } from "../../../app.ts";
import { requireKey, requireServerKey, type KeyVars } from "../../../http/client-key.ts";
import { queryAnalyticsRoutes } from "./analytics.ts";
import { queryIssueRoutes } from "./issues.ts";

/** Read access to analytics and issues with a server key. Scoped to the key's environment. */
export function queryRoutes(deps: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .use("/query/*", requireKey(deps), requireServerKey())
    .route("/", queryAnalyticsRoutes(deps))
    .route("/", queryIssueRoutes(deps));
}
