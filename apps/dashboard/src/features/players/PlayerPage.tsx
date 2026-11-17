import { Link } from "@tanstack/react-router";
import { AreaChart } from "../../components/charts/AreaChart.tsx";
import { Card, CardHeader, CopyButton, EmptyState } from "../../components/ui/index.ts";
import { formatAgo, formatNumber } from "../../lib/format.ts";
import { useEnvironment } from "../studio/index.ts";
import { usePlayer, type PlayerData } from "./api/use-players.ts";
import { PlayerCrashes, PlayerReports, TopEvents } from "./components/PlayerLists.tsx";

const utc = (s: string) => new Date(`${s.replace(" ", "T")}Z`);
/** The last n UTC days as "YYYY-MM-DD", oldest first, today last. */
const lastDays = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));

function Stats({ p }: { p: PlayerData["profile"] }) {
  const stats: [string, string][] = [
    ["First seen", formatAgo(utc(p.firstSeen))],
    ["Last seen", formatAgo(utc(p.lastSeen))],
    ["Events", formatNumber(p.events)],
    ["Sessions", formatNumber(p.sessions)],
    ["Days played", formatNumber(p.daysActive)],
    ["Now on", `${p.platform} · ${p.build}`],
  ];
  return (
    <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
      {stats.map(([label, value]) => (
        <Card key={label} className="flex flex-col gap-1 p-3">
          <span className="text-xs text-muted">{label}</span>
          <span className="truncate text-sm font-medium">{value}</span>
        </Card>
      ))}
    </div>
  );
}

/** One player's history in the selected environment. */
export function PlayerPage({ playerId }: { playerId: string }) {
  const { selected } = useEnvironment();
  const data = usePlayer(selected?.env.id ?? "", playerId);
  if (data.isPending) return <p className="px-8 py-6 text-muted">Loading player…</p>;
  if (data.isError) {
    return (
      <Card className="mx-8 my-6">
        <EmptyState title="Player not found">{data.error.message}. They may be in another environment.</EmptyState>
      </Card>
    );
  }
  const { profile, reports } = data.data;
  const byDay = new Map(profile.daily.map((d) => [d.day, d.events]));
  return (
    <div className="flex max-w-5xl flex-col gap-5 px-8 py-6">
      <Link to="/players" className="text-sm text-muted hover:text-fg">
        ← Players
      </Link>
      <div className="flex items-center gap-2">
        <h1 className="font-mono text-lg font-semibold">{profile.playerId}</h1>
        <CopyButton text={profile.playerId} />
        <Link to="/events" search={{ player: profile.playerId }} className="ml-auto text-sm text-muted hover:text-fg">
          Open in Events →
        </Link>
      </div>
      <Stats p={profile} />
      <Card>
        <CardHeader title="Events per day" action={<span className="text-xs text-muted">Last 30 days, UTC</span>} />
        <div className="p-4">
          <AreaChart data={lastDays(30).map((day) => ({ day, value: byDay.get(day) ?? 0 }))} label="Events" partialLast height={140} />
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <TopEvents events={profile.topEvents} />
        <PlayerReports reports={reports} />
      </div>
      <PlayerCrashes crashes={profile.crashes} />
    </div>
  );
}
