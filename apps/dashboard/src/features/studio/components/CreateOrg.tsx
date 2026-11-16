import { useState, type FormEvent } from "react";
import { Button, Input, Logo } from "../../../components/ui/index.ts";
import { useCreateOrg } from "../api/use-studio-mutations.ts";

/** First-run screen for a user with no org: name the studio, become its owner. */
export function CreateOrg() {
  const [name, setName] = useState("");
  const create = useCreateOrg();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(name.trim());
  };
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="flex w-full max-w-[360px] flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo height={28} className="text-fg" />
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold tracking-tight">Name your studio</h1>
            <p className="text-muted">Your games and their keys live under it.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-5">
          <Input
            required
            autoFocus
            maxLength={80}
            placeholder="Hollow Pine Games"
            aria-label="Studio name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="primary" className="h-9" disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Creating…" : "Create studio"}
          </Button>
          {create.error && <p className="text-xs text-danger">{create.error.message}</p>}
        </div>
      </form>
    </div>
  );
}
