import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, ConfirmDialog } from "../../../../components/ui/index.ts";
import type { Environment, Game } from "../../api/use-games.ts";
import { useCreateKey, useRevokeKey } from "../../api/use-studio-mutations.ts";
import { NewKeyDialog } from "./NewKeyDialog.tsx";

type Role = "owner" | "dev" | "viewer";
type NewKey = { raw: string; kind: "client" | "server" };

// Production first: it's the one people look for.
const envOrder = (env: Environment) => (env.name === "production" ? 0 : 1);

type KeyInfo = Environment["keys"][number];

function KeyRow({ keyInfo, canRevoke, onRevoke }: { keyInfo: KeyInfo; canRevoke: boolean; onRevoke: () => void }) {
  return (
    <li className="flex h-9 items-center gap-3 px-4 hover:bg-hover">
      <span className="w-14 shrink-0 text-xs text-muted">{keyInfo.kind}</span>
      <code className="flex-1 font-mono text-xs">{keyInfo.prefix}…</code>
      <span className="w-24 shrink-0 text-right text-xs text-muted">{new Date(keyInfo.createdAt).toLocaleDateString()}</span>
      <span className="w-16 shrink-0 text-right">
        {canRevoke && (
          <button className="text-xs text-muted hover:text-danger" onClick={onRevoke}>
            Revoke
          </button>
        )}
      </span>
    </li>
  );
}

function EnvironmentKeys({ orgId, env, role, onCreated }: { orgId: string; env: Environment; role: Role; onCreated: (k: NewKey) => void }) {
  const createKey = useCreateKey(orgId);
  const revoke = useRevokeKey(orgId);
  const [revoking, setRevoking] = useState<{ id: string; prefix: string } | null>(null);
  const make = (kind: "client" | "server") =>
    createKey.mutate({ environmentId: env.id, kind }, { onSuccess: (key) => onCreated({ raw: key.raw, kind }) });
  const error = createKey.error ?? revoke.error;

  return (
    <div className="flex flex-col border-t border-border">
      <div className="flex h-10 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className={`size-1.5 rounded-full ${env.name === "production" ? "bg-ok" : "bg-faint"}`} />
          <span className="font-medium">{env.name}</span>
        </div>
        {role !== "viewer" && (
          <div className="flex gap-1.5">
            <Button variant="ghost" className="h-7 px-2" disabled={createKey.isPending} onClick={() => make("client")}>
              + Client key
            </Button>
            {role === "owner" && (
              <Button variant="ghost" className="h-7 px-2" disabled={createKey.isPending} onClick={() => make("server")}>
                + Server key
              </Button>
            )}
          </div>
        )}
      </div>
      {env.keys.length === 0 ? (
        <p className="px-4 pb-3 text-muted">No keys yet. Games need a client key to send events.</p>
      ) : (
        <ul className="flex flex-col pb-1">
          {env.keys.map((key) => (
            <KeyRow key={key.id} keyInfo={key} canRevoke={role !== "viewer"} onRevoke={() => setRevoking(key)} />
          ))}
        </ul>
      )}
      {error && <p className="px-4 pb-3 text-xs text-danger">{error.message}</p>}
      <ConfirmDialog
        open={revoking !== null}
        title="Revoke this key?"
        description={
          <>
            <code className="font-mono text-xs text-fg">{revoking?.prefix}…</code> stops working immediately. Games still using it
            can't send data until they ship a new key.
          </>
        }
        confirmLabel="Revoke key"
        tone="danger"
        pending={revoke.isPending}
        onCancel={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })}
      />
    </div>
  );
}

export function GameCard({ orgId, game, role }: { orgId: string; game: Game; role: Role }) {
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  return (
    <Card>
      <header className="flex h-11 items-center gap-2 px-4">
        <h2 className="text-sm font-medium">{game.name}</h2>
        <span className="flex-1 font-mono text-xs text-muted">{game.slug}</span>
        <Link to="/settings/games/$gameId" params={{ gameId: game.id }} className="text-xs text-muted hover:text-fg">
          Settings →
        </Link>
      </header>
      {[...game.environments]
        .sort((a, b) => envOrder(a) - envOrder(b))
        .map((env) => (
          <EnvironmentKeys key={env.id} orgId={orgId} env={env} role={role} onCreated={setNewKey} />
        ))}
      {newKey && <NewKeyDialog rawKey={newKey.raw} kind={newKey.kind} onClose={() => setNewKey(null)} />}
    </Card>
  );
}
