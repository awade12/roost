import type { Features, Platform } from "@roost/setup";
import { Button, Field, Segmented, Select } from "../../../components/ui/index.ts";
import { cn } from "../../../lib/cn.ts";
import type { Game } from "../../studio/index.ts";
import type { SetupChoice } from "../use-setup-files.ts";

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "expo", label: "Expo / React Native" },
  { value: "web", label: "Web" },
  { value: "rust", label: "Rust" },
];
const FEATURES: { key: keyof Features; label: string; rustOnly?: boolean }[] = [
  { key: "crashes", label: "Crashes" },
  { key: "nativeCrashes", label: "Native crashes", rustOnly: true },
  { key: "reports", label: "Bug reports" },
  { key: "flags", label: "Flags" },
  { key: "ai", label: "AI" },
  { key: "debugFiles", label: "Symbols / source maps" },
];

type Props = { game: Game; choice: SetupChoice; onChange: (c: SetupChoice) => void; onCreateKey: () => void; creatingKey: boolean };

export function SetupOptions({ game, choice, onChange, onCreateKey, creatingKey }: Props) {
  const set = (patch: Partial<SetupChoice>) => onChange({ ...choice, ...patch });
  const toggle = (key: keyof Features) => set({ features: { ...choice.features, [key]: !choice.features[key] } });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Environment">
          <Select aria-label="Environment" value={choice.envId} options={game.environments.map((e) => ({ value: e.id, label: e.name }))} onChange={(envId) => set({ envId, clientKey: null })} />
        </Field>
        <Field label="Game is built with">
          <Segmented label="Platform" options={PLATFORMS} value={choice.platform} onChange={(platform) => set({ platform })} />
        </Field>
      </div>
      <Field label="Include">
        <div className="flex flex-wrap gap-1.5">
          {FEATURES.filter((f) => !f.rustOnly || choice.platform === "rust").map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={choice.features[f.key]}
              onClick={() => toggle(f.key)}
              className={cn("h-7 rounded-md border px-2.5 text-xs", choice.features[f.key] ? "border-chart/60 bg-chart/10 text-fg" : "border-border text-muted hover:text-fg")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs">
        <span className="text-muted">
          {choice.clientKey ? <>A new client key is written into the guide. It's shown only here, so copy the files now.</> : <>The guide reads the client key from an env var. Or put a fresh one in it:</>}
        </span>
        {!choice.clientKey && (
          <Button className="h-7 shrink-0 px-2" disabled={creatingKey} onClick={onCreateKey}>
            {creatingKey ? "Creating…" : "Create client key"}
          </Button>
        )}
      </div>
    </div>
  );
}
