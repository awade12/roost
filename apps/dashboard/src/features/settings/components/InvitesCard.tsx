import { useState, type FormEvent } from "react";
import { Button, Input, Select } from "../../../components/ui/index.ts";
import { formatAgo } from "../../../lib/format.ts";
import { useInvites, useRevokeInvite, useSendInvite } from "../api/use-studio-settings.ts";
import { Section } from "./SettingsSection.tsx";

type Role = "owner" | "dev" | "viewer";
const ROLES: { value: Role; label: string }[] = [
  { value: "dev", label: "Dev" },
  { value: "viewer", label: "Viewer" },
  { value: "owner", label: "Owner" },
];

/** Owners invite people by email; the link works for 7 days and only for that address. */
export function InvitesCard({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("dev");
  const pending = useInvites(orgId, true);
  const send = useSendInvite(orgId);
  const revoke = useRevokeInvite(orgId);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate({ email: email.trim(), role }, { onSuccess: () => setEmail("") });
  };
  return (
    <Section title="Invite people" description="They get an email with a link. They sign in with that address to join; it works for 7 days.">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Input className="min-w-56 flex-1" type="email" placeholder="name@studio.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select aria-label="Role" className="w-32" value={role} options={ROLES} onChange={setRole} />
        <Button variant="primary" disabled={!email.includes("@") || send.isPending}>
          {send.isPending ? "Sending…" : "Send invite"}
        </Button>
      </form>
      {send.isSuccess && !send.isPending && <p className="px-4 pb-3 text-xs text-muted">Invite sent.</p>}
      {(send.error ?? revoke.error) && <p className="px-4 pb-3 text-xs text-danger">{(send.error ?? revoke.error)?.message}</p>}
      {pending.data?.map((i) => (
        <div key={i.id} className="flex h-11 items-center gap-3 px-4">
          <span className="min-w-0 flex-1 truncate">{i.email}</span>
          <span className="w-16 text-xs text-muted capitalize">{i.role}</span>
          <span className="w-32 text-right text-xs text-muted">sent {formatAgo(i.createdAt)}</span>
          <button className="w-14 text-right text-xs text-muted hover:text-danger" onClick={() => revoke.mutate(i.id)}>
            Revoke
          </button>
        </div>
      ))}
    </Section>
  );
}
