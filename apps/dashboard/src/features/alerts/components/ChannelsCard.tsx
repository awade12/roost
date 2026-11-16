import { useState } from "react";
import { Button, ConfirmDialog } from "../../../components/ui/index.ts";
import { formatAgo } from "../../../lib/format.ts";
import {
  useChannels,
  useDeleteChannel,
  useTestChannel,
  type AlertChannel,
} from "../api/use-channels.ts";
import { ChannelDialog } from "./ChannelDialog.tsx";

const KIND_LABEL: Record<AlertChannel["kind"], string> = {
  discord: "Discord",
  slack: "Slack",
  webhook: "Webhook",
  email: "Email",
};

/** The studio's alert channels: add (owners), test (devs), remove (owners). */
export function ChannelsCard({ orgId, role }: { orgId: string; role: "owner" | "dev" | "viewer" }) {
  const channels = useChannels(orgId);
  const test = useTestChannel(orgId);
  const remove = useDeleteChannel(orgId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AlertChannel | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const isOwner = role === "owner";

  return (
    <section className="rounded-lg border border-border bg-panel">
      <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium">Alert channels</h2>
          <p className="text-xs text-muted">
            Discord, Slack, a webhook or email. Alert rules pick which ones to use.
          </p>
        </div>
        {isOwner && <Button onClick={() => setAdding(true)}>Add channel</Button>}
      </header>
      {channels.isPending && <p className="px-4 py-3 text-muted">Loading channels…</p>}
      {channels.isError && <p className="px-4 py-3 text-danger">{channels.error.message}</p>}
      {channels.data?.length === 0 && (
        <p className="px-4 py-4 text-muted">
          No channels yet.{" "}
          {isOwner ? "Add one to start getting alerts." : "Ask an owner to add one."}
        </p>
      )}
      <ul className="divide-y divide-border">
        {channels.data?.map((ch) => (
          <ChannelRow
            key={ch.id}
            channel={ch}
            role={role}
            testing={test.isPending && tested === ch.id}
            sent={tested === ch.id && test.isSuccess}
            onTest={() => {
              setTested(ch.id);
              test.mutate(ch.id);
            }}
            onRemove={() => setRemoving(ch)}
          />
        ))}
      </ul>
      {test.error && <p className="px-4 py-3 text-xs text-danger">{test.error.message}</p>}
      <ChannelDialog orgId={orgId} open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={removing !== null}
        title="Remove this channel?"
        description={`Rules that use "${removing?.name ?? ""}" stop sending there. Other channels on those rules keep working.`}
        confirmLabel="Remove channel"
        tone="danger"
        pending={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() =>
          removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })
        }
      />
    </section>
  );
}

type RowProps = {
  channel: AlertChannel;
  role: "owner" | "dev" | "viewer";
  testing: boolean;
  sent: boolean;
  onTest: () => void;
  onRemove: () => void;
};

function ChannelRow({ channel: ch, role, testing, sent, onTest, onRemove }: RowProps) {
  return (
    <li className="flex h-12 items-center gap-3 px-4">
      <span className="w-20 shrink-0 text-xs text-muted">{KIND_LABEL[ch.kind]}</span>
      <span className="font-medium">{ch.name}</span>
      <span className="flex-1 truncate font-mono text-xs text-muted">{ch.hint}</span>
      <span className="hidden text-xs text-faint sm:inline">{formatAgo(ch.createdAt)}</span>
      {sent && <span className="text-xs text-ok">Sent</span>}
      {role !== "viewer" && (
        <Button variant="ghost" className="h-7 px-2" disabled={testing} onClick={onTest}>
          {testing ? "Sending…" : "Send test"}
        </Button>
      )}
      {role === "owner" && (
        <button className="text-xs text-muted hover:text-danger" onClick={onRemove}>
          Remove
        </button>
      )}
    </li>
  );
}
