import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card, EmptyState, Input } from "../../components/ui/index.ts";
import { formatAgo, formatNumber } from "../../lib/format.ts";
import { useEnvironment } from "../studio/index.ts";
import { usePlayers } from "./api/use-players.ts";

const utc = (s: string) => new Date(`${s.replace(" ", "T")}Z`);

/** Find a player by id; the list shows who played most recently. */
export function PlayersPage() {
  const { selected } = useEnvironment();
  const [q, setQ] = useState("");
  const players = usePlayers(selected?.env.id ?? "", q.trim());
  return (
    <div className="flex max-w-4xl flex-col gap-5 px-8 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Players</h1>
        <p className="text-muted">Look up one player's sessions, events, crashes and reports, e.g. when they email support.</p>
      </div>
      <Input mono autoFocus placeholder="Search player id…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card>
        {players.isPending && <p className="px-4 py-3 text-muted">Loading players…</p>}
        {players.isError && <p className="px-4 py-3 text-danger">{players.error.message}</p>}
        {players.data?.length === 0 && <EmptyState title="No players found">Only players seen in the last 30 days are listed. Try another id.</EmptyState>}
        <ul className="divide-y divide-border">
          {players.data?.map((p) => (
            <li key={p.player_id}>
              <Link to="/players/$playerId" params={{ playerId: p.player_id }} className="flex h-11 items-center gap-4 px-4 hover:bg-hover">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{p.player_id}</span>
                <span className="w-28 text-right text-xs text-muted">{formatNumber(p.events)} events</span>
                <span className="w-24 text-right text-xs text-muted">{formatNumber(p.sessions)} sessions</span>
                <span className="w-24 truncate text-right text-xs text-muted">{p.last_platform} {p.last_build}</span>
                <span className="w-24 text-right text-xs text-muted">{formatAgo(utc(p.last_seen))}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
