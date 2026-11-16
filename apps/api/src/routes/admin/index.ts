import { Hono } from "hono";
import { csrf } from "hono/csrf";
import type { AppDeps } from "../../app.ts";
import { aiAdminRoutes } from "./ai/index.ts";
import { alertChannelRoutes, alertRuleRoutes } from "./alerts/index.ts";
import { overviewRoutes } from "./analytics/index.ts";
import { authRoutes, meRoutes } from "./auth/index.ts";
import { integrationRoutes } from "./integrations/index.ts";
import { collabRoutes, eventRoutes, issueRoutes, linearRoutes } from "./issues/index.ts";
import { reportAdminRoutes } from "./reports/index.ts";
import { gameSettingsRoutes, studioSettingsRoutes } from "./settings/index.ts";
import { gameRoutes, keyRoutes, navRoutes, orgRoutes } from "./studio/index.ts";

/**
 * Dashboard-only API, authenticated by the session cookie. Free to change:
 * the dashboard is typed against `AdminApp`, so drift breaks its build.
 * csrf() rejects cross-site form posts; JSON bodies need a CORS preflight we never grant.
 */
export function adminRoutes(deps: AppDeps) {
  return new Hono()
    .use(csrf())
    .route("/auth", authRoutes(deps))
    .route("/", meRoutes(deps))
    .route("/", orgRoutes(deps))
    .route("/", gameRoutes(deps))
    .route("/", keyRoutes(deps))
    .route("/", overviewRoutes(deps))
    .route("/", aiAdminRoutes(deps))
    .route("/", issueRoutes(deps))
    .route("/", eventRoutes(deps))
    .route("/", collabRoutes(deps))
    .route("/", linearRoutes(deps))
    .route("/", integrationRoutes(deps))
    .route("/", gameSettingsRoutes(deps))
    .route("/", studioSettingsRoutes(deps))
    .route("/", alertChannelRoutes(deps))
    .route("/", alertRuleRoutes(deps))
    .route("/", reportAdminRoutes(deps))
    .route("/", navRoutes(deps));
}

export type AdminApp = ReturnType<typeof adminRoutes>;
