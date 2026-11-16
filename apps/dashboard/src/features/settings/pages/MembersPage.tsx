import { useState } from "react";
import { ConfirmDialog, Select } from "../../../components/ui/index.ts";
import { useMe } from "../../session/index.ts";
import { useCurrentOrg, useMembers } from "../../studio/index.ts";
import { useRemoveMember, useSetMemberRole } from "../api/use-studio-settings.ts";
import { Section } from "../components/SettingsSection.tsx";

type Role = "owner" | "dev" | "viewer";
const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "owner", label: "Owner", hint: "Everything, incl. settings, limits and server keys" },
  { value: "dev", label: "Dev", hint: "Games, keys, templates, issues, alerts" },
  { value: "viewer", label: "Viewer", hint: "Read only" },
];

export function MembersPage() {
  const org = useCurrentOrg();
  const me = useMe().data;
  const members = useMembers(org?.id);
  const setRole = useSetMemberRole(org?.id ?? "");
  const remove = useRemoveMember(org?.id ?? "");
  const [removing, setRemoving] = useState<{ id: string; email: string } | null>(null);
  if (!org) return null;
  const isOwner = org.role === "owner";
  const error = setRole.error ?? remove.error;

  return (
    <Section title="Members" description="Change roles or remove people. Inviting new members is coming next.">
      {members.isPending && <p className="px-4 py-3 text-muted">Loading members…</p>}
      {members.isError && <p className="px-4 py-3 text-danger">{members.error.message}</p>}
      {members.data?.map((m) => (
        <div key={m.id} className="flex h-12 items-center gap-3 px-4">
          <span className="flex-1 truncate">
            {m.email}
            {m.id === me?.id && <span className="ml-2 text-xs text-muted">you</span>}
          </span>
          <Select
            aria-label={`Role for ${m.email}`}
            size="sm"
            align="end"
            className="w-32"
            disabled={!isOwner}
            value={m.role}
            options={ROLES}
            onChange={(role) => setRole.mutate({ userId: m.id, role })}
          />
          <span className="w-16 text-right">
            {(isOwner || m.id === me?.id) && (
              <button className="text-xs text-muted hover:text-danger" onClick={() => setRemoving({ id: m.id, email: m.email })}>
                {m.id === me?.id ? "Leave" : "Remove"}
              </button>
            )}
          </span>
        </div>
      ))}
      {error && <p className="px-4 py-3 text-xs text-danger">{error.message}</p>}
      <ConfirmDialog
        open={removing !== null}
        title={removing?.id === me?.id ? "Leave this studio?" : "Remove this member?"}
        description={`${removing?.email ?? ""} loses access to every game in ${org.name}.`}
        confirmLabel={removing?.id === me?.id ? "Leave" : "Remove"}
        tone="danger"
        pending={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
    </Section>
  );
}
