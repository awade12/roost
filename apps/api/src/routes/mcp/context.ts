import type { Clickhouse } from "@roost/clickhouse";
import type { Db } from "@roost/db";

/** What every tool runs against: one environment, resolved from the server key. */
export type ToolContext = { db: Db; ch: Clickhouse; environmentId: string; gameId: string };

/** MCP tool result carrying JSON both as text (every client) and structured content. */
export function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** A tool-level error the agent can read and act on, instead of a protocol failure. */
export function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
