import { useState } from "react";
import { Button } from "../../../../components/ui/index.ts";
import { Card } from "../../../../components/ui/index.ts";
import { EmptyState } from "../../../../components/ui/index.ts";
import { useCurrentOrg } from "../../api/use-current-org.ts";
import { useGames } from "../../api/use-games.ts";
import { CreateGameForm } from "./CreateGameForm.tsx";
import { GameCard } from "./GameCard.tsx";

export function GamesPage() {
  const org = useCurrentOrg();
  if (!org) return null; // OrgGate guarantees an org; this only satisfies the types.
  return <Games orgId={org.id} role={org.role} />;
}

function Games({ orgId, role }: { orgId: string; role: "owner" | "dev" | "viewer" }) {
  const games = useGames(orgId);
  const [adding, setAdding] = useState(false);
  const canEdit = role !== "viewer";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-muted">Each game has environments. Put a client key in your game build to send data.</p>
        {canEdit && games.data && games.data.length > 0 && !adding && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            New game
          </Button>
        )}
      </div>

      {adding && (
        <Card className="p-4">
          <CreateGameForm orgId={orgId} onDone={() => setAdding(false)} />
        </Card>
      )}

      {games.isPending && <p className="text-muted">Loading games…</p>}
      {games.isError && <p className="text-danger">{games.error.message}</p>}
      {games.data?.length === 0 && (
        <Card>
          <EmptyState title="No games yet">
            {canEdit ? "Create your first game to get its keys." : "Ask an owner to create a game."}
          </EmptyState>
          {canEdit && (
            <div className="mx-auto w-full max-w-md px-4 pb-8">
              <CreateGameForm orgId={orgId} />
            </div>
          )}
        </Card>
      )}
      {games.data?.map((game) => <GameCard key={game.id} orgId={orgId} game={game} role={role} />)}
    </div>
  );
}
