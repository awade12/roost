import { useState, type FormEvent } from "react";
import { Button, Input } from "../../../components/ui/index.ts";
import type { Game } from "../../studio/index.ts";
import { useAddEnvironment, useRenameGame } from "../api/use-game-settings.ts";
import { Row, Section } from "./SettingsSection.tsx";

/** Name and environments. Devs and owners can change these. */
export function GameGeneral({ game, canEdit }: { game: Game; canEdit: boolean }) {
  const [name, setName] = useState(game.name);
  const [env, setEnv] = useState("");
  const rename = useRenameGame(game.id);
  const addEnv = useAddEnvironment(game.id);
  const submitName = (e: FormEvent) => {
    e.preventDefault();
    rename.mutate(name.trim());
  };
  const submitEnv = (e: FormEvent) => {
    e.preventDefault();
    addEnv.mutate(env.trim(), { onSuccess: () => setEnv("") });
  };

  return (
    <Section title="General">
      <form onSubmit={submitName}>
        <Row label="Name" description={<>Slug <code className="font-mono">{game.slug}</code> stays the same, so nothing breaks.</>}>
          <Input className="w-56" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
          {canEdit && (
            <Button disabled={!name.trim() || name.trim() === game.name || rename.isPending}>{rename.isPending ? "Saving…" : "Rename"}</Button>
          )}
        </Row>
        {rename.error && <p className="px-4 pb-3 text-xs text-danger">{rename.error.message}</p>}
      </form>
      <form onSubmit={submitEnv}>
        <Row
          label="Environments"
          description={
            <span className="flex flex-wrap gap-1.5 pt-1">
              {game.environments.map((e) => (
                <span key={e.id} className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-fg">
                  {e.name}
                </span>
              ))}
            </span>
          }
        >
          {canEdit && (
            <>
              <Input className="w-40" mono placeholder="staging" value={env} onChange={(e) => setEnv(e.target.value.toLowerCase())} />
              <Button disabled={!env.trim() || addEnv.isPending}>Add</Button>
            </>
          )}
        </Row>
        {addEnv.error && <p className="px-4 pb-3 text-xs text-danger">{addEnv.error.message}</p>}
      </form>
    </Section>
  );
}
