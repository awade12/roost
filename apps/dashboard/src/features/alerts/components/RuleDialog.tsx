import { useState, type FormEvent } from "react";
import {
  Button,
  Dialog,
  Field,
  Input,
  Segmented,
  Select,
  Switch,
} from "../../../components/ui/index.ts";
import { cn } from "../../../lib/cn.ts";
import type { Environment } from "../../studio/index.ts";
import {
  useSaveRule,
  type AlertRule,
  type IssueKind,
  type RuleForm,
  type Trigger,
} from "../api/use-alerts.ts";
import type { AlertChannel } from "../api/use-channels.ts";

const TRIGGERS: { value: Trigger; label: string }[] = [
  { value: "new_issue", label: "New issue" },
  { value: "regression", label: "Regression" },
  { value: "spike", label: "Spike" },
];
const TRIGGER_HELP: Record<Trigger, string> = {
  new_issue: "Once, the first time a new issue shows up.",
  regression: "Once each time a resolved issue happens again.",
  spike: "When one issue gets many reports in a short time. Quiet for the cooldown afterwards.",
};
const KINDS: IssueKind[] = ["crash", "error", "message"];

function blank(envs: Environment[], channels: AlertChannel[]): RuleForm {
  const prod = envs.find((e) => e.name === "production") ?? envs[0];
  return {
    name: "",
    environmentId: prod?.id ?? "",
    trigger: "new_issue",
    kinds: ["crash", "error"],
    threshold: 50,
    windowMinutes: 60,
    cooldownMinutes: 60,
    channelIds: channels.slice(0, 1).map((c) => c.id),
    enabled: true,
  };
}

type Props = {
  gameId: string;
  rule: AlertRule | null;
  environments: Environment[];
  channels: AlertChannel[];
  onClose: () => void;
};

/** Create or edit a rule. Mounted only while open, so it starts from the rule each time. */
export function RuleDialog({ gameId, rule, environments, channels, onClose }: Props) {
  const [form, setForm] = useState<RuleForm>(rule ? { ...rule } : blank(environments, channels));
  const save = useSaveRule(gameId);
  const set = (patch: Partial<RuleForm>) => setForm((f) => ({ ...f, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: rule?.id ?? null, form: { ...form, name: form.name.trim() } },
      { onSuccess: onClose },
    );
  };
  const ready =
    form.name.trim() && form.environmentId && form.kinds.length > 0 && form.channelIds.length > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={rule ? "Edit alert rule" : "New alert rule"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" form="rule-form" disabled={!ready || save.isPending}>
            {save.isPending ? "Saving…" : rule ? "Save rule" : "Create rule"}
          </Button>
        </>
      }
    >
      <form id="rule-form" onSubmit={submit} className="flex flex-col gap-4">
        <RuleFields form={form} set={set} environments={environments} channels={channels} />
        {save.error && <p className="text-xs text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  );
}

const toggle = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

type FieldsProps = {
  form: RuleForm;
  set: (patch: Partial<RuleForm>) => void;
  environments: Environment[];
  channels: AlertChannel[];
};

function RuleFields({ form, set, environments, channels }: FieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input
            autoFocus
            value={form.name}
            placeholder="New crashes in production"
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label="Environment">
          <Select
            aria-label="Environment"
            value={form.environmentId}
            options={environments.map((e) => ({ value: e.id, label: e.name }))}
            onChange={(environmentId) => set({ environmentId })}
          />
        </Field>
      </div>
      <Field label="When" hint={TRIGGER_HELP[form.trigger]}>
        <Segmented
          label="Trigger"
          options={TRIGGERS}
          value={form.trigger}
          onChange={(trigger) => set({ trigger })}
        />
      </Field>
      {form.trigger === "spike" && <SpikeFields form={form} set={set} />}
      <Targets form={form} set={set} channels={channels} />
    </>
  );
}

/** Which issue kinds count, and which channels hear about it. */
function Targets({ form, set, channels }: Omit<FieldsProps, "environments">) {
  return (
    <>
      <Field label="Issue kinds">
        <div className="flex gap-1.5">
          {KINDS.map((k) => (
            <Chip
              key={k}
              on={form.kinds.includes(k)}
              onClick={() => set({ kinds: toggle(form.kinds, k) })}
            >
              {k}
            </Chip>
          ))}
        </div>
      </Field>
      <Field
        label="Send to"
        hint={
          channels.length === 0 ? "Add a channel under Settings → Integrations first." : undefined
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {channels.map((c) => (
            <Chip
              key={c.id}
              on={form.channelIds.includes(c.id)}
              onClick={() => set({ channelIds: toggle(form.channelIds, c.id) })}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="flex items-center justify-between">
        <span className="text-muted">Enabled</span>
        <Switch hideLabel label="Enabled" checked={form.enabled} onChange={(enabled) => set({ enabled })} />
      </div>
    </>
  );
}

function SpikeFields({ form, set }: { form: RuleForm; set: (patch: Partial<RuleForm>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="Reports">
        <Input
          mono
          type="number"
          min={1}
          inputClassName="text-right"
          suffix="or more"
          value={form.threshold}
          onChange={(e) => set({ threshold: Number(e.target.value) })}
        />
      </Field>
      <Field label="Within">
        <Input
          mono
          type="number"
          min={5}
          max={1440}
          inputClassName="text-right"
          suffix="min"
          value={form.windowMinutes}
          onChange={(e) => set({ windowMinutes: Number(e.target.value) })}
        />
      </Field>
      <Field label="Then quiet for">
        <Input
          mono
          type="number"
          min={5}
          inputClassName="text-right"
          suffix="min"
          value={form.cooldownMinutes}
          onChange={(e) => set({ cooldownMinutes: Number(e.target.value) })}
        />
      </Field>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-7 rounded-md border px-2.5 text-xs",
        on ? "border-chart/60 bg-chart/10 text-fg" : "border-border text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
