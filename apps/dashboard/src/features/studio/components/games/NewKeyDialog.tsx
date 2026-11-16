import { useState } from "react";
import { Button, Dialog, Input } from "../../../../components/ui/index.ts";

type Props = { rawKey: string; kind: "client" | "server"; onClose: () => void };

/** Shows a new key once. The API never returns the raw value again. */
export function NewKeyDialog({ rawKey, kind, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Copy your new ${kind} key`}
      description="This is the only time it's shown. Roost stores a hash, so a lost key can't be recovered, only replaced."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <Input
        mono
        readOnly
        aria-label="New key"
        value={rawKey}
        onFocus={(e) => e.target.select()}
        inputClassName="text-xs"
        className="pr-1"
        suffix={
          <Button className="h-7" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </Button>
        }
      />
      {kind === "server" && <p className="text-xs text-warn">Server keys can read all of this game's data. Keep them out of game builds.</p>}
    </Dialog>
  );
}
