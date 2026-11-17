import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, EmptyState } from "../../../components/ui/index.ts";
import { LimitsForm } from "../../ai/index.ts";
import { SetupDialog } from "../../setup/index.ts";
import { useCurrentOrg, useGames } from "../../studio/index.ts";
import { useGameSettings } from "../api/use-game-settings.ts";
import { DebugFiles } from "../components/DebugFiles.tsx";
import { GameApiForm } from "../components/GameApiForm.tsx";
import { GameGeneral } from "../components/GameGeneral.tsx";

/** Everything tunable for one game: name, environments, API, issues, AI limits. */
export function GameSettingsPage({ gameId, openSetup = false }: { gameId: string; openSetup?: boolean }) {
  const org = useCurrentOrg();
  const games = useGames(org?.id ?? "");
  const settings = useGameSettings(gameId);
  const game = games.data?.find((g) => g.id === gameId);
  const [setup, setSetup] = useState(openSetup);

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
      <Card className="flex items-center justify-between gap-4 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">Set up in your game</span>
          <span className="text-xs text-muted">Instructions for your coding agent (ROOST.md) and a starter config, for Expo, web or Rust.</span>
        </div>
        <Button variant="primary" className="shrink-0" onClick={() => setSetup(true)}>
          Get setup files
        </Button>
      </Card>
      {setup && <SetupDialog orgId={org.id} game={game} onClose={() => setSetup(false)} />}
      <GameGeneral key={game.name} game={game} canEdit={org.role !== "viewer"} />
      {/* Keyed on the saved values so the form resets after a save elsewhere. */}
      <GameApiForm key={JSON.stringify(data.settings)} gameId={gameId} data={data} />
      <DebugFiles gameId={gameId} canEdit={org.role !== "viewer"} />
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
