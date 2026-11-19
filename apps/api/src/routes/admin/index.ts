import { Hono, type MiddlewareHandler } from "hono";
import { csrf } from "hono/csrf";
import type { AppDeps } from "../../app.ts";
import { aiAdminRoutes } from "./ai/index.ts";
import { alertChannelRoutes, alertRuleRoutes } from "./alerts/index.ts";
import { eventExplorerRoutes, overviewRoutes, playerRoutes, retentionRoutes } from "./analytics/index.ts";
import { authRoutes, meRoutes } from "./auth/index.ts";
import { configAdminRoutes } from "./config/index.ts";
import { integrationRoutes } from "./integrations/index.ts";
import { collabRoutes, eventRoutes, issueRoutes, linearRoutes } from "./issues/index.ts";
import { reportAdminRoutes } from "./reports/index.ts";
import { debugFileAdminRoutes, gameSettingsRoutes, inviteRoutes, studioSettingsRoutes } from "./settings/index.ts";
import { gameRoutes, keyRoutes, navRoutes, orgRoutes } from "./studio/index.ts";

/**
 * CSRF guards cookie sessions. A bearer token (the mobile app) can't be attached by another site:
 * browsers won't send an Authorization header cross-origin without a preflight we never grant.
 * Native apps also send no Origin, which csrf() would reject.
 */
function csrfUnlessBearer(): MiddlewareHandler {
  const check = csrf();
  return (c, next) => (/^Bearer \S+$/.test(c.req.header("authorization") ?? "") ? next() : check(c, next));
}

/**
 * Dashboard and mobile-app API, authenticated by the session cookie or a bearer token. Free to change:
 * the dashboard is typed against `AdminApp`, so drift breaks its build.
 * csrf() rejects cross-site form posts; JSON bodies need a CORS preflight we never grant.
 */
export function adminRoutes(deps: AppDeps) {
  return new Hono()
    .use(csrfUnlessBearer())
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
    .route("/", navRoutes(deps))
    .route("/", eventExplorerRoutes(deps))
    .route("/", debugFileAdminRoutes(deps))
    .route("/", retentionRoutes(deps))
    .route("/", playerRoutes(deps))
    .route("/", configAdminRoutes(deps))
    .route("/", inviteRoutes(deps));
}

export type AdminApp = ReturnType<typeof adminRoutes>;
