import { useState, type FormEvent, type ReactNode } from "react";
import { Input, Select, Switch } from "../../../components/ui/index.ts";
import type { GameSettings, GameSettingsData } from "../api/use-game-settings.ts";
import { useSaveGameSettings } from "../api/use-game-settings.ts";
import { DefaultHint, Row, SaveBar, Section } from "./SettingsSection.tsx";

const RESOLVE_OPTIONS = [0, 1, 3, 7, 14, 30, 90].map((d) => ({
  value: String(d),
  label: d === 0 ? "Never" : `After ${d} day${d === 1 ? "" : "s"}`,
}));

/** The game API switches and issue behaviour: one form, saved together. */
export function GameApiForm({ gameId, data }: { gameId: string; data: GameSettingsData }) {
  const [form, setForm] = useState<GameSettings>(data.settings);
  const save = useSaveGameSettings(gameId);
  const { defaults, canEdit } = data;
  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);
  const set: Setter = (group, patch) =>
    setForm((f) => ({ ...f, [group]: { ...f[group], ...patch } }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <ApiSection form={form} set={set} defaults={defaults} canEdit={canEdit} />
      <IssuesSection
        form={form}
        set={set}
        defaults={defaults}
        canEdit={canEdit}
        footer={
          canEdit ? (
            <SaveBar
              dirty={dirty}
              pending={save.isPending}
              saved={save.isSuccess}
              error={save.error}
              onReset={() => setForm(data.settings)}
            />
          ) : (
            <p className="px-4 py-3 text-xs text-muted">Only owners can change these.</p>
          )
        }
      />
    </form>
  );
}

type Setter = <K extends keyof GameSettings>(group: K, patch: Partial<GameSettings[K]>) => void;
type SectionProps = { form: GameSettings; set: Setter; defaults: GameSettings; canEdit: boolean };

function ApiSection({ form, set, defaults, canEdit }: SectionProps) {
  return (
    <Section
      title="Game API"
      description="How builds of this game talk to Roost. Changes apply within 30 seconds."
    >
      <Row
        label="Accept data from games"
        description={
          form.api.enabled
            ? "Events, crash reports and AI calls are accepted."
            : "Paused: every call gets 403 and SDKs drop the data. Use for abuse or a runaway build."
        }
      >
        <Switch
          hideLabel
          label="Accept data from games"
          checked={form.api.enabled}
          disabled={!canEdit}
          onChange={(enabled) => set("api", { enabled })}
        />
      </Row>
      <Row
        label="Rate limit per key"
        description="Requests a minute from one API key before it gets rate_limited. SDKs batch, so a player sends a few a minute."
      >
        <DefaultHint
          value={defaults.api.requestsPerMinute}
          current={form.api.requestsPerMinute}
          onReset={() => set("api", { requestsPerMinute: defaults.api.requestsPerMinute })}
        />
        <Input
          mono
          type="number"
          min={10}
          max={100000}
          className="w-40"
          inputClassName="text-right"
          suffix="/ min"
          disabled={!canEdit}
          value={form.api.requestsPerMinute}
          onChange={(e) => set("api", { requestsPerMinute: Number(e.target.value) })}
        />
      </Row>
    </Section>
  );
}

function IssuesSection({
  form,
  set,
  defaults,
  canEdit,
  footer,
}: SectionProps & { footer: ReactNode }) {
  return (
    <Section title="Issues" description="How crash and error reports become issues.">
      <Row
        label="Grouping depth"
        description="Top in-app stack frames that must match for two reports to be the same issue. Fewer merges more; more splits more. Only new reports are affected."
      >
        <DefaultHint
          value={defaults.issues.groupingFrames}
          current={form.issues.groupingFrames}
          onReset={() => set("issues", { groupingFrames: defaults.issues.groupingFrames })}
        />
        <Input
          mono
          type="number"
          min={1}
          max={10}
          className="w-40"
          inputClassName="text-right"
          suffix="frames"
          disabled={!canEdit}
          value={form.issues.groupingFrames}
          onChange={(e) => set("issues", { groupingFrames: Number(e.target.value) })}
        />
      </Row>
      <Row
        label="Auto-resolve"
        description="Resolve issues with no new reports for a while. If one comes back it reopens as a regression."
      >
        <Select
          aria-label="Auto-resolve"
          className="w-40"
          align="end"
          disabled={!canEdit}
          value={String(form.issues.autoResolveDays)}
          options={
            RESOLVE_OPTIONS.some((o) => o.value === String(form.issues.autoResolveDays))
              ? RESOLVE_OPTIONS
              : [
                  ...RESOLVE_OPTIONS,
                  {
                    value: String(form.issues.autoResolveDays),
                    label: `After ${form.issues.autoResolveDays} days`,
                  },
                ]
          }
          onChange={(v) => set("issues", { autoResolveDays: Number(v) })}
        />
      </Row>
      {footer}
    </Section>
  );
}
