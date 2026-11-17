import { useState, type FormEvent } from "react";
import { Button, Dialog, Field, Input, Segmented, Switch, Textarea } from "../../../components/ui/index.ts";
import { useSaveFlag, type Flag, type FlagType } from "../api/use-flags.ts";
import { parseOverrides, parseValue, showOverrides, showValue } from "./values.ts";

const TYPES: { value: FlagType; label: string }[] = [
  { value: "boolean", label: "On / off" },
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "json", label: "JSON" },
];
const BOOL = [
  { value: "true", label: "On" },
  { value: "false", label: "Off" },
];

/** One editable value, shaped by the flag type. */
function ValueField({ type, value, onChange, label }: { type: FlagType; value: string; onChange: (v: string) => void; label: string }) {
  if (type === "boolean") return <Segmented label={label} options={BOOL} value={value === "true" ? "true" : "false"} onChange={onChange} />;
  if (type === "json") return <Textarea aria-label={label} className="font-mono text-xs" rows={4} value={value} onChange={(e) => onChange(e.target.value)} />;
  return <Input aria-label={label} mono={type === "number"} value={value} onChange={(e) => onChange(e.target.value)} />;
}

type Draft = { key: string; type: FlagType; description: string; value: string; rollout: boolean; percent: string; rolloutValue: string; overrides: string };

const draftFrom = (flag: Flag | null): Draft =>
  flag
    ? { key: flag.key, type: flag.type, description: flag.description, value: showValue(flag.type, flag.value), rollout: flag.rollout !== null, percent: String(flag.rollout?.percent ?? 10), rolloutValue: showValue(flag.type, flag.rollout?.value ?? flag.value), overrides: showOverrides(flag.type, flag.overrides) }
    : { key: "", type: "boolean", description: "", value: "false", rollout: false, percent: "10", rolloutValue: "true", overrides: "" };

/** Turns the draft into the API's shape, or says what's wrong. */
function toFields(d: Draft) {
  const value = parseValue(d.type, d.value);
  if (!value.ok) return { error: `Value ${value.error}` };
  const rolloutValue = parseValue(d.type, d.rolloutValue);
  if (d.rollout && !rolloutValue.ok) return { error: `Rollout value ${rolloutValue.error}` };
  const overrides = parseOverrides(d.type, d.overrides);
  if (!overrides.ok) return { error: `Overrides ${overrides.error}` };
  const rollout = d.rollout && rolloutValue.ok ? { percent: Math.min(100, Math.max(0, Number(d.percent) || 0)), value: rolloutValue.value } : null;
  return { fields: { description: d.description.trim(), value: value.value, rollout, overrides: overrides.value } };
}

function Rollout({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Gradual rollout</span>
        <Switch hideLabel label="Gradual rollout" checked={d.rollout} onChange={(rollout) => set({ rollout })} />
      </div>
      {d.rollout && (
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Field label="Players">
            <Input mono type="number" min={0} max={100} inputClassName="text-right" suffix="%" value={d.percent} onChange={(e) => set({ percent: e.target.value })} />
          </Field>
          <Field label="Get this value" hint="Each player stays in or out as you raise the percent.">
            <ValueField type={d.type} label="Rollout value" value={d.rolloutValue} onChange={(rolloutValue) => set({ rolloutValue })} />
          </Field>
        </div>
      )}
    </div>
  );
}

function Fields({ d, set, isNew }: { d: Draft; set: (p: Partial<Draft>) => void; isNew: boolean }) {
  return (
    <>
      {isNew && (
        <>
          <Field label="Key" hint="How the game asks for it, e.g. new_shop or enemy.tuning. Can't change later.">
            <Input autoFocus mono value={d.key} placeholder="new_shop" onChange={(e) => set({ key: e.target.value.toLowerCase() })} />
          </Field>
          <Segmented label="Type" options={TYPES} value={d.type} onChange={(type) => set({ type, value: type === "boolean" ? "false" : "", rolloutValue: type === "boolean" ? "true" : "" })} />
        </>
      )}
      <Field label="Description">
        <Input value={d.description} placeholder="What it controls" onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Value for everyone">
        <ValueField type={d.type} label="Value" value={d.value} onChange={(value) => set({ value })} />
      </Field>
      <Rollout d={d} set={set} />
      <Field label="Overrides" hint="One per line: player-id = value. Beats the rollout; good for testers.">
        <Textarea className="font-mono text-xs" rows={3} value={d.overrides} placeholder="qa-tester-1 = true" onChange={(e) => set({ overrides: e.target.value })} />
      </Field>
    </>
  );
}

/** Create or edit a flag. Mounted only while open, so it starts from the flag each time. */
export function FlagDialog({ environmentId, flag, onClose, onDelete }: { environmentId: string; flag: Flag | null; onClose: () => void; onDelete: () => void }) {
  const [d, setD] = useState<Draft>(draftFrom(flag));
  const [error, setError] = useState<string | null>(null);
  const save = useSaveFlag(environmentId);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const out = toFields(d);
    if (!out.fields) return setError(out.error ?? "Invalid");
    setError(null);
    save.mutate({ id: flag?.id ?? null, create: { key: d.key, type: d.type }, fields: out.fields }, { onSuccess: onClose });
  };
  const footer = (
    <>
      {flag && (
        <Button variant="danger" className="mr-auto" onClick={onDelete}>
          Delete
        </Button>
      )}
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" form="flag-form" disabled={save.isPending || (!flag && !d.key)}>
        {save.isPending ? "Saving…" : flag ? "Save" : "Create flag"}
      </Button>
    </>
  );
  return (
    <Dialog open onClose={onClose} title={flag ? flag.key : "New flag"} description={flag ? `${TYPES.find((t) => t.value === flag.type)?.label ?? flag.type} flag` : "Games read it by key with the Roost SDK."} footer={footer}>
      <form id="flag-form" onSubmit={submit} className="flex flex-col gap-4 pb-4">
        <Fields d={d} set={set} isNew={!flag} />
        {(error ?? save.error?.message) && <p className="text-xs text-danger">{error ?? save.error?.message}</p>}
      </form>
    </Dialog>
  );
}
