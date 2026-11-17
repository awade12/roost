import { useState } from "react";
import { Card } from "../../components/ui/index.ts";
import { EmptyState } from "../../components/ui/index.ts";
import { useCurrentOrg, useEnvironment } from "../studio/index.ts";
import { useAi, type AiTemplate } from "./api/use-ai.ts";
import { DecisionsTable } from "./components/DecisionsTable.tsx";
import { LimitsForm } from "./components/LimitsForm.tsx";
import { TemplateEditor } from "./components/TemplateEditor.tsx";
import { TemplatesTable } from "./components/TemplatesTable.tsx";
import { UsageCards } from "./components/UsageCards.tsx";

export function AiPage() {
  const { selected, games } = useEnvironment();
  if (games.isPending) return <p className="px-8 py-6 text-muted">Loading…</p>;
  if (!selected) {
    return (
      <Card className="mx-8 my-6">
        <EmptyState title="No game yet">Create a game in Games &amp; keys to set up its AI proxy.</EmptyState>
      </Card>
    );
  }
  return <GameAi gameId={selected.game.id} />;
}

function GameAi({ gameId }: { gameId: string }) {
  const role = useCurrentOrg()?.role ?? "viewer";
  const ai = useAi(gameId);
  // undefined = closed, null = new template, otherwise the template being edited.
  const [editing, setEditing] = useState<AiTemplate | null | undefined>(undefined);

  if (ai.isPending) return <p className="px-8 py-6 text-muted">Loading…</p>;
  if (ai.isError) return <p className="px-8 py-6 text-danger">{ai.error.message}</p>;
  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <UsageCards data={ai.data} />
      <TemplatesTable data={ai.data} canEdit={role !== "viewer"} onEdit={setEditing} />
      <DecisionsTable data={ai.data} />
      <LimitsForm key={JSON.stringify(ai.data.limits)} gameId={gameId} limits={ai.data.limits} isOwner={role === "owner"} />
      {editing !== undefined && <TemplateEditor gameId={gameId} template={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
