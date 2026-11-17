import { useState } from "react";
import { Button, Card, ConfirmDialog, EmptyState } from "../../components/ui/index.ts";
import { useCurrentOrg, useEnvironment } from "../studio/index.ts";
import { useDeleteFlag, useFlags, type Flag } from "./api/use-flags.ts";
import { FlagDialog } from "./components/FlagDialog.tsx";
import { FlagList } from "./components/FlagList.tsx";

const SNIPPET = `const shop = roost.flags.getBoolean("new_shop", false);
// Rust: roost.flag_bool("new_shop", false)`;

/** Remote config and feature flags for the selected environment. */
export function ConfigPage() {
  const org = useCurrentOrg();
  const { selected } = useEnvironment();
  const envId = selected?.env.id ?? "";
  const flags = useFlags(envId);
  const remove = useDeleteFlag(envId);
  const [editing, setEditing] = useState<Flag | "new" | null>(null);
  const [deleting, setDeleting] = useState<Flag | null>(null);
  const canEdit = org?.role !== "viewer";

  return (
    <div className="flex max-w-5xl flex-col gap-5 px-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">Config & flags</h1>
          <p className="text-muted">Change values and roll features out to some players, without an update. Each environment has its own flags; games pick up changes within minutes.</p>
        </div>
        {canEdit && selected && (
          <Button variant="primary" className="shrink-0" onClick={() => setEditing("new")}>
            New flag
          </Button>
        )}
      </div>
      <Card>
        {flags.isPending && selected && <p className="px-4 py-3 text-muted">Loading flags…</p>}
        {flags.isError && <p className="px-4 py-3 text-danger">{flags.error.message}</p>}
        {flags.data?.length === 0 && (
          <EmptyState title="No flags yet">
            Create one, then read it in the game:
            <pre className="mx-auto mt-3 w-fit rounded-md border border-border bg-bg p-3 text-left font-mono text-[11px]">{SNIPPET}</pre>
          </EmptyState>
        )}
        {flags.data && flags.data.length > 0 && <FlagList flags={flags.data} onOpen={(f) => canEdit && setEditing(f)} />}
      </Card>
      {editing && <FlagDialog environmentId={envId} flag={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDelete={() => editing !== "new" && setDeleting(editing)} />}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.key ?? ""}?`}
        description="Games stop getting it and fall back to the default in their code."
        confirmLabel="Delete flag"
        tone="danger"
        pending={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setEditing(null);
            },
          })
        }
      />
    </div>
  );
}
