import type { Clickhouse } from "@roost/clickhouse";

/** What the Events page can filter on. Every field is optional except the time range. */
export type EventFilters = {
  hours: number;
  name?: string | undefined;
  playerId?: string | undefined;
  build?: string | undefined;
  platform?: string | undefined;
  /** Matches a prop by key and value, e.g. level = forest-3 (strings, numbers and booleans). */
  prop?: { key: string; value: string } | undefined;
};

type Params = Record<string, string | number>;

/**
 * WHERE clause and its params. Values are always bound as query params, never
 * spliced into SQL, so filter text from the dashboard can't change the query.
 */
function where(env: string, f: EventFilters): { sql: string; params: Params } {
  const parts = ["environment_id = {env:UUID}", "occurred_at >= now64(3) - toIntervalHour({hours:UInt32})"];
  const params: Params = { env, hours: f.hours };
  if (f.name) {
    parts.push("name = {name:String}");
    params.name = f.name;
  }
  if (f.playerId) {
    parts.push("player_id = {player:String}");
    params.player = f.playerId;
  }
  if (f.build) {
    parts.push("build = {build:String}");
    params.build = f.build;
  }
  if (f.platform) {
    parts.push("platform = {platform:String}");
    params.platform = f.platform;
  }
  if (f.prop) {
    // Strings compare unquoted; numbers and booleans compare as their raw JSON text.
    parts.push("(JSONExtractString(toJSONString(props), {pk:String}) = {pv:String} OR JSONExtractRaw(toJSONString(props), {pk:String}) = {pv:String})");
    params.pk = f.prop.key;
    params.pv = f.prop.value;
  }
  return { sql: parts.join(" AND "), params };
}

async function rows<T>(ch: Clickhouse, query: string, params: Params): Promise<T[]> {
  const result = await ch.query({ query, query_params: params, format: "JSONEachRow" });
  return result.json<T>();
}

export type EventRow = {
  id: string;
  name: string;
  player_id: string;
  session_id: string;
  build: string;
  platform: string;
  value: number | null;
  props: string;
  occurred_at: string;
};

export const EVENTS_PAGE = 100;

/**
 * Newest first. `before` continues after the last row of the previous page. Retries
 * of the same event (same id) are shown once.
 */
export async function listEvents(ch: Clickhouse, env: string, f: EventFilters, before?: { at: string; id: string }) {
  const w = where(env, f);
  const cursor = before ? " AND (occurred_at, id) < (parseDateTime64BestEffort({at:String}, 3), toUUID({cid:String}))" : "";
  const params = before ? { ...w.params, at: before.at, cid: before.id } : w.params;
  // Aliased as props_json, not props: ClickHouse aliases are visible in WHERE and would
  // shadow the JSON column that the prop filter reads.
  const raw = await rows<Omit<EventRow, "props"> & { props_json: string }>(
    ch,
    `SELECT id, name, player_id, session_id, build, platform, value, toJSONString(props) AS props_json, occurred_at
     FROM events WHERE ${w.sql}${cursor}
     ORDER BY occurred_at DESC, id DESC LIMIT 1 BY id LIMIT {limit:UInt32}`,
    { ...params, limit: EVENTS_PAGE + 1 },
  );
  const data: EventRow[] = raw.map(({ props_json, ...r }) => ({ ...r, props: props_json }));
  const page = data.slice(0, EVENTS_PAGE);
  const last = page.at(-1);
  return { events: page, next: data.length > EVENTS_PAGE && last ? { at: last.occurred_at, id: last.id } : null };
}

export type SeriesRow = { bucket: string; events: string; players: string };

/** Events and players per hour (ranges up to 2 days) or per day, for the chart above the list. */
export function eventSeries(ch: Clickhouse, env: string, f: EventFilters) {
  const w = where(env, f);
  const bucket = f.hours <= 48 ? "toStartOfHour(occurred_at)" : "toStartOfDay(occurred_at)";
  return rows<SeriesRow>(
    ch,
    `SELECT formatDateTime(${bucket}, '%Y-%m-%dT%H:%i:%SZ') AS bucket, uniqExact(id) AS events, uniqExact(player_id) AS players
     FROM events WHERE ${w.sql} GROUP BY bucket ORDER BY bucket`,
    w.params,
  );
}

type Facet = { value: string; count: string };

/** Event names, builds and platforms seen in the range, most common first, for the filter menus. */
export async function eventFacets(ch: Clickhouse, env: string, hours: number) {
  const params = { env, hours };
  const base = "FROM events WHERE environment_id = {env:UUID} AND occurred_at >= now64(3) - toIntervalHour({hours:UInt32})";
  const facet = (col: string, limit: number) => rows<Facet>(ch, `SELECT ${col} AS value, uniqExact(id) AS count ${base} GROUP BY value ORDER BY count DESC LIMIT ${limit}`, params);
  const [names, builds, platforms] = await Promise.all([facet("name", 200), facet("build", 50), facet("platform", 10)]);
  const counts = (list: Facet[]) => list.map((r) => ({ value: r.value, count: Number(r.count) }));
  return { names: counts(names), builds: counts(builds), platforms: counts(platforms) };
}
