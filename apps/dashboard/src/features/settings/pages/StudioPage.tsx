import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button, Input } from "../../../components/ui/index.ts";
import { useCurrentOrg, useGames } from "../../studio/index.ts";
import { useRenameStudio } from "../api/use-studio-settings.ts";
import { Row, Section } from "../components/SettingsSection.tsx";

export function StudioPage() {
  const org = useCurrentOrg();
  if (!org) return null; // OrgGate guarantees an org; this only satisfies the types.
  return <Studio orgId={org.id} name={org.name} isOwner={org.role === "owner"} />;
}

function Studio({ orgId, name: saved, isOwner }: { orgId: string; name: string; isOwner: boolean }) {
  const [name, setName] = useState(saved);
  const rename = useRenameStudio(orgId);
  const games = useGames(orgId);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    rename.mutate(name.trim());
  };

  return (
    <div className="flex flex-col gap-5">
      <Section title="Studio">
        <form onSubmit={submit}>
          <Row label="Name" description="Shown in the sidebar and in alert emails.">
            <Input className="w-64" value={name} disabled={!isOwner} onChange={(e) => setName(e.target.value)} />
            {isOwner && <Button disabled={!name.trim() || name.trim() === saved || rename.isPending}>{rename.isPending ? "Saving…" : "Rename"}</Button>}
          </Row>
          {rename.error && <p className="px-4 pb-3 text-xs text-danger">{rename.error.message}</p>}
        </form>
      </Section>
      <Section title="Games" description="Each game has its own API switches, issue grouping and AI limits.">
        {games.isPending && <p className="px-4 py-3 text-muted">Loading…</p>}
        {games.isError && <p className="px-4 py-3 text-danger">{games.error.message}</p>}
        {games.data?.length === 0 && <p className="px-4 py-3 text-muted">No games yet. Create one under Games & keys.</p>}
        {games.data?.map((game) => (
          <Link key={game.id} to="/settings/games/$gameId" params={{ gameId: game.id }} className="flex h-11 items-center justify-between px-4 hover:bg-hover">
            <span className="font-medium">{game.name}</span>
            <span className="text-xs text-muted">{game.environments.length} environments →</span>
          </Link>
        ))}
      </Section>
    </div>
  );
}
