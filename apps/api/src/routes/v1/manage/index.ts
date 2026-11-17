import { Hono } from "hono";
import type { AppDeps } from "../../../app.ts";
import { limitBody, ONE_MB } from "../../../http/body-limit.ts";
import { requireKey, requireServerKey, type KeyVars } from "../../../http/client-key.ts";
import { manageConfigRoutes } from "./config.ts";
import { manageItemRoutes } from "./items.ts";

/**
 * Manage a game from code with a server key: templates, flags, AI limits and settings, one at
 * a time or as a whole config file. Additive like the rest of /v1.
 */
export function manageRoutes(deps: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .use("/manage/*", limitBody(ONE_MB), requireKey(deps.db), requireServerKey())
    .route("/", manageConfigRoutes(deps))
    .route("/", manageItemRoutes(deps));
}
