import { useEffect, useRef, useState, type FormEvent } from "react";
import { Input } from "../../../../components/ui/index.ts";
import { cn } from "../../../../lib/cn.ts";
import { LABEL_COLORS, useGameLabels, useLabelMutations, type LabelColor } from "../../api/use-issue-collab.ts";
import { LABEL_DOT, LabelChip } from "../list/LabelChip.tsx";

type Props = { gameId: string; issueId: string; current: { id: string; name: string; color: string }[]; disabled: boolean };

/** Inline form at the bottom of the picker: name + color, then it's applied to the issue. */
function NewLabel({ gameId, issueId }: { gameId: string; issueId: string }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const { toggle, create } = useLabelMutations(gameId, issueId);
  const add = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim(), color },
      {
        onSuccess: (label) => {
          setName("");
          toggle.mutate({ labelId: label.id, on: true });
        },
      },
    );
  };
  return (
    <form onSubmit={add} className="mt-1 flex flex-col gap-2 border-t border-border p-2">
      <Input size="sm" placeholder="New label" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Label color">
        {LABEL_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} onClick={() => setColor(c)} className={cn("size-5 rounded-full border-2", c === color ? "border-fg" : "border-transparent")}>
            <span className={cn("block size-full rounded-full", LABEL_DOT[c])} />
          </button>
        ))}
      </div>
      {create.error && <p className="text-xs text-danger">{create.error.message}</p>}
    </form>
  );
}

/** Shows the issue's labels; the popover toggles game labels and creates new ones. */
export function LabelPicker({ gameId, issueId, current, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const labels = useGameLabels(gameId);
  const { toggle } = useLabelMutations(gameId, issueId);
  const on = new Set(current.map((l) => l.id));

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);


  return (
    <div ref={root} className="relative flex flex-wrap items-center gap-1.5">
      {current.map((l) => (
        <LabelChip key={l.id} name={l.name} color={l.color} />
      ))}
      {!disabled && (
        <button className="h-5 rounded-full border border-dashed border-border px-2 text-[11px] text-muted hover:text-fg" aria-expanded={open} onClick={() => setOpen(!open)}>
          {current.length ? "Edit" : "+ Label"}
        </button>
      )}
      {open && (
        <div className="absolute top-full right-0 z-40 mt-1 w-64 rounded-lg border border-border bg-panel p-1 shadow-xl shadow-black/40">
          {(labels.data ?? []).map((l) => (
            <button key={l.id} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-hover" onClick={() => toggle.mutate({ labelId: l.id, on: !on.has(l.id) })}>
              <span className={cn("flex size-3.5 items-center justify-center rounded border", on.has(l.id) ? "border-fg bg-fg text-bg" : "border-border")}>{on.has(l.id) && "✓"}</span>
              <span className={cn("size-2 rounded-full", LABEL_DOT[l.color])} />
              {l.name}
            </button>
          ))}
          <NewLabel gameId={gameId} issueId={issueId} />
        </div>
      )}
    </div>
  );
}
