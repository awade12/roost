import type { AdminApp } from "@roost/api/admin";
import { hc } from "hono/client";

/** Typed client for /admin. A changed API route breaks this build, not production. */
export const adminApi = hc<AdminApp>("/admin", { init: { credentials: "include" } });
