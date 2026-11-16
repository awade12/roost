import { useState, type FormEvent } from "react";
import { Button, Dialog, Field, Input, Segmented } from "../../../components/ui/index.ts";
import { useCreateChannel, type ChannelKind, type NewChannel } from "../api/use-channels.ts";

const KINDS: { value: ChannelKind; label: string }[] = [
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
  { value: "webhook", label: "Webhook" },
  { value: "email", label: "Email" },
];

const URL_HELP: Record<Exclude<ChannelKind, "email">, string> = {
  discord: "Channel settings → Integrations → Webhooks → New webhook → Copy URL.",
  slack: "Create an app with Incoming Webhooks, add one to a channel, copy its URL.",
  webhook: "Any https:// endpoint. Roost POSTs JSON with the issue, rule and link.",
};

/** Form state for a new channel; `close` also clears it so the next open starts blank. */
function useChannelDraft(orgId: string, onClose: () => void) {
  const [kind, setKind] = useState<ChannelKind>("discord");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [recipients, setRecipients] = useState<"everyone" | "owners">("everyone");
  const create = useCreateChannel(orgId);
  const close = () => {
    create.reset();
    setName("");
    setUrl("");
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const channel: NewChannel =
      kind === "email"
        ? { kind, name: name.trim(), recipients }
        : { kind, name: name.trim(), url: url.trim() };
    create.mutate(channel, { onSuccess: close });
  };
  const ready = Boolean(name.trim() && (kind === "email" || url.trim()));
  return {
    kind,
    setKind,
    name,
    setName,
    url,
    setUrl,
    recipients,
    setRecipients,
    create,
    close,
    submit,
    ready,
  };
}

export function ChannelDialog({
  orgId,
  open,
  onClose,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
}) {
  const {
    kind,
    setKind,
    name,
    setName,
    url,
    setUrl,
    recipients,
    setRecipients,
    create,
    close,
    submit,
    ready,
  } = useChannelDraft(orgId, onClose);
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add alert channel"
      description="Where alerts are sent. Webhook URLs are encrypted and never shown again."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" form="channel-form" disabled={!ready || create.isPending}>
            {create.isPending ? "Adding…" : "Add channel"}
          </Button>
        </>
      }
    >
      <form id="channel-form" onSubmit={submit} className="flex flex-col gap-4">
        <Segmented label="Channel type" options={KINDS} value={kind} onChange={setKind} />
        <Field label="Name" hint="For you, e.g. #crashes or On-call">
          <Input
            autoFocus
            value={name}
            placeholder={kind === "email" ? "Studio email" : "#crashes"}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Destination
          kind={kind}
          url={url}
          setUrl={setUrl}
          recipients={recipients}
          setRecipients={setRecipients}
        />
        {create.error && <p className="text-xs text-danger">{create.error.message}</p>}
      </form>
    </Dialog>
  );
}

type DestinationProps = {
  kind: ChannelKind;
  url: string;
  setUrl: (url: string) => void;
  recipients: "everyone" | "owners";
  setRecipients: (r: "everyone" | "owners") => void;
};

/** Email picks who in the studio; everything else takes a webhook URL. */
function Destination({ kind, url, setUrl, recipients, setRecipients }: DestinationProps) {
  return kind === "email" ? (
    <Field label="Send to" hint="Uses each member's sign-in email.">
      <Segmented
        label="Recipients"
        options={[
          { value: "everyone" as const, label: "Everyone in the studio" },
          { value: "owners" as const, label: "Owners only" },
        ]}
        value={recipients}
        onChange={setRecipients}
      />
    </Field>
  ) : (
    <Field label="Webhook URL" hint={URL_HELP[kind]}>
      <Input mono value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
    </Field>
  );
}
