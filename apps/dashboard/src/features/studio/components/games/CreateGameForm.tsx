import { useState, type FormEvent } from "react";
import { Button, Input } from "../../../../components/ui/index.ts";
import { useCreateGame } from "../../api/use-studio-mutations.ts";

/** Inline "new game" form. A game starts with production and development environments. */
export function CreateGameForm({ orgId, onDone }: { orgId: string; onDone?: () => void }) {
  const [name, setName] = useState("");
  const create = useCreateGame(orgId);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(name.trim(), {
      onSuccess: () => {
        setName("");
        onDone?.();
      },
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          className="flex-1"
          required
          autoFocus
          maxLength={80}
          placeholder="Game name, e.g. Sky Forge"
          aria-label="Game name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button variant="primary" disabled={create.isPending || !name.trim()}>
          {create.isPending ? "Creating…" : "Create game"}
        </Button>
      </div>
      {create.error && <p className="text-xs text-danger">{create.error.message}</p>}
    </form>
  );
}
