import type { Clickhouse } from "@roost/clickhouse";
import { lastDays, weekOverWeek } from "./days.ts";
import { d1Retention, dailyRows, hasEvents, topEvents } from "./queries.ts";

export type OverviewDay = { day: string; players: number; events: number; newPlayers: number };

export type Overview = {
  hasEvents: boolean;
  /** One entry per UTC day, oldest first; the last one is today (partial). */
  days: OverviewDay[];
  /** 7-day averages over complete days, compared with the 7 days before. */
  summary: {
    players: { value: number; change: number | null };
    newPlayers: { value: number; change: number | null };
    events: { value: number; change: number | null };
  };
  d1: { cohort: number; retained: number; rate: number | null };
  topEvents: { name: string; count: number }[];
};

export async function getOverview(ch: Clickhouse, environmentId: string, days: number): Promise<Overview> {
  // Week-over-week needs 14 complete days, so always read at least 15.
  const params = { env: environmentId, days: Math.max(days, 15) };
  const [daily, d1, top, any] = await Promise.all([
    dailyRows(ch, params),
    d1Retention(ch, { env: environmentId, days }),
    topEvents(ch, params),
    hasEvents(ch, params),
  ]);

  const byDay = new Map(daily.map((r) => [r.day, r]));
  const filled = lastDays(params.days).map((day) => {
    const row = byDay.get(day);
    return {
      day,
      players: Number(row?.players ?? 0),
      events: Number(row?.events ?? 0),
      newPlayers: Number(row?.new_players ?? 0),
    };
  });
  const complete = filled.slice(0, -1); // today is still in progress
  const cohort = Number(d1[0]?.cohort ?? 0);
  const retained = Number(d1[0]?.retained ?? 0);

  return {
    hasEvents: any,
    days: filled.slice(-days),
    summary: {
      players: weekOverWeek(complete.map((d) => d.players)),
      newPlayers: weekOverWeek(complete.map((d) => d.newPlayers)),
      events: weekOverWeek(complete.map((d) => d.events)),
    },
    d1: { cohort, retained, rate: cohort > 0 ? retained / cohort : null },
    topEvents: top.map((t) => ({ name: t.name, count: Number(t.count) })),
  };
}
