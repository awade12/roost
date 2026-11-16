import { useState, type FormEvent } from "react";
import { Button, Card, CardHeader, Field, Input } from "../../../components/ui/index.ts";
import type { AiLimits } from "../api/use-ai.ts";
import { useSaveLimits } from "../api/use-ai-mutations.ts";

/** Spend and abuse limits. Only owners can change them; a hit limit returns `rate_limited` to the game. */
export function LimitsForm({ gameId, limits, isOwner }: { gameId: string; limits: AiLimits; isOwner: boolean }) {
  const [form, setForm] = useState({ ...limits, monthlyCapCents: limits.monthlyCapCents / 100 });
  const save = useSaveLimits(gameId);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ ...form, monthlyCapCents: Math.round(form.monthlyCapCents * 100) });
  };
  const fields = [
    { key: "playerDailyTokens", label: "Per player, per day", unit: "tokens" },
    { key: "playerPerMinute", label: "Per player rate", unit: "calls / min" },
    { key: "monthlyCapCents", label: "Game monthly cap", unit: "USD" },
  ] as const;

  return (
    <Card>
      <CardHeader title="Limits" action={!isOwner && <span className="text-xs text-muted">Owners can change these</span>} />
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <p className="text-muted">When a limit is hit, the game gets a <code className="font-mono text-xs">rate_limited</code> error it can handle, never a surprise bill.</p>
        <div className="grid grid-cols-3 gap-3">
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input
                mono
                type="number"
                min={0}
                step={f.key === "monthlyCapCents" ? 0.01 : 1}
                disabled={!isOwner}
                inputClassName="text-right"
                suffix={f.unit}
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
              />
            </Field>
          ))}
        </div>
        {isOwner && (
          <div className="flex items-center justify-end gap-3">
            {save.isSuccess && <span className="text-xs text-muted">Saved</span>}
            {save.error && <span className="text-xs text-danger">{save.error.message}</span>}
            <Button variant="primary" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save limits"}</Button>
          </div>
        )}
      </form>
    </Card>
  );
}
