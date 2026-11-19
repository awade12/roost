import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono, type Context } from "hono";
import type { AppDeps } from "../../app.ts";
import { KEY_HEADER, requireKey, requireServerKey, type KeyVars } from "../../http/client-key.ts";
import { buildServer } from "./server.ts";

/** MCP clients send `Authorization: Bearer <key>`; scripts may use X-Roost-Key like the rest of the API. */
const readKey = (c: Context) => /^Bearer (\S+)$/.exec(c.req.header("authorization") ?? "")?.[1] ?? c.req.header(KEY_HEADER);

/**
 * Model Context Protocol endpoint (Streamable HTTP, stateless, JSON responses) so agents can
 * read issues, reports and analytics and make small changes. Needs a server key; every tool is
 * scoped to that key's environment, and the key's per-minute limit applies.
 */
export function mcpRoutes(deps: AppDeps) {
  return new Hono<{ Variables: KeyVars }>().all("/", requireKey(deps, { readKey, missing: "Send a server key as Authorization: Bearer rk_server_…" }), requireServerKey(), async (c) => {
    const server = buildServer({ db: deps.db, ch: deps.ch, environmentId: c.get("environmentId"), gameId: c.get("gameId") });
    // No sessionIdGenerator: stateless mode, so no session lives in one replica's memory.
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      void server.close();
    }
  });
}
