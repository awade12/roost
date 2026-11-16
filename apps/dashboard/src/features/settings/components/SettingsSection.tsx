import type { ReactNode } from "react";
import { Button, Card } from "../../../components/ui/index.ts";

/** A titled group of settings, Linear-style: label and help on the left, control on the right. */
export function Section({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium">{title}</h2>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        {action}
      </header>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </Card>
  );
}

export function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    // Wraps the control below the label when the panel is narrow, instead of crushing the text.
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

type SaveBarProps = { dirty: boolean; pending: boolean; saved: boolean; error: Error | null; onReset: () => void; label?: string };

/** Shown under a form: Save only lights up when something changed. */
export function SaveBar({ dirty, pending, saved, error, onReset, label = "Save changes" }: SaveBarProps) {
  return (
    <div className="flex items-center justify-end gap-3 px-4 py-3">
      {error && <span className="text-xs text-danger">{error.message}</span>}
      {!error && saved && !dirty && <span className="text-xs text-muted">Saved</span>}
      {dirty && (
        <Button type="button" variant="ghost" onClick={onReset} disabled={pending}>
          Discard
        </Button>
      )}
      <Button variant="primary" disabled={!dirty || pending}>
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}

/** "Default: 120" next to a field, so changed values are easy to spot and undo. */
export function DefaultHint({ value, current, onReset }: { value: string | number; current: string | number; onReset: () => void }) {
  if (value === current) return <span className="text-xs text-faint">Default</span>;
  return (
    <button type="button" className="text-xs text-muted hover:text-fg" onClick={onReset}>
      Reset to {value}
    </button>
  );
}
