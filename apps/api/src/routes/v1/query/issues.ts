import { zValidator } from "@hono/zod-validator";
import { issues } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import type { KeyVars } from "../../../http/client-key.ts";
import { AppError } from "../../../http/errors.ts";

/** Issues with their 30-day counts, e.g. for a release gate in CI ("no new crashes in this build"). */
export function queryIssueRoutes({ db, ch }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>().get(
    "/query/issues",
    zValidator("query", z.object({ status: z.enum(["unresolved", "resolved", "ignored"]).default("unresolved") }), (r) => {
      if (!r.success) throw new AppError("bad_request", "status is unresolved, resolved or ignored");
    }),
    async (c) => {
      const env = c.get("environmentId");
      const [rows, counts] = await Promise.all([issues.listIssues(db, env, c.req.valid("query").status), issues.issueCounts(ch, env)]);
      const empty = { events: 0, players: 0, last24h: 0 };
      return c.json({ issues: rows.map((r) => ({ ...r, ...(counts.get(r.id) ?? empty) })) });
    },
  );
}
