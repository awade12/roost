import { Link } from "@tanstack/react-router";
import { Card, EmptyState } from "../../../components/ui/index.ts";
import { LimitsForm } from "../../ai/index.ts";
import { useCurrentOrg, useGames } from "../../studio/index.ts";
import { useGameSettings } from "../api/use-game-settings.ts";
import { GameApiForm } from "../components/GameApiForm.tsx";
import { GameGeneral } from "../components/GameGeneral.tsx";

/** Everything tunable for one game: name, environments, API, issues, AI limits. */
export function GameSettingsPage({ gameId }: { gameId: string }) {
  const org = useCurrentOrg();
  const games = useGames(org?.id ?? "");
  const settings = useGameSettings(gameId);
  const game = games.data?.find((g) => g.id === gameId);

  if (games.isPending || settings.isPending) return <p className="text-muted">Loading settings…</p>;
  if (settings.isError) return <p className="text-danger">{settings.error.message}</p>;
  if (!game || !org) {
    return (
      <Card>
        <EmptyState title="Game not found">It may have been deleted, or you don't have access.</EmptyState>
      </Card>
    );
  }
  const data = settings.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings/games" className="text-muted hover:text-fg">
          Games & keys
        </Link>
        <span className="text-faint">/</span>
        <span className="font-medium">{game.name}</span>
      </div>
      <GameGeneral key={game.name} game={game} canEdit={org.role !== "viewer"} />
      {/* Keyed on the saved values so the form resets after a save elsewhere. */}
      <GameApiForm key={JSON.stringify(data.settings)} gameId={gameId} data={data} />
      <LimitsForm key={JSON.stringify(data.ai)} gameId={gameId} limits={data.ai} isOwner={org.role === "owner"} />
      <p className="text-xs text-muted">
        Alert rules for this game are on the{" "}
        <Link to="/alerts" className="text-fg underline-offset-2 hover:underline">
          Alerts
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
