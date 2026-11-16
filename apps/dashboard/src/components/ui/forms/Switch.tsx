import { cn } from "../../../lib/cn.ts";

type Props = { checked: boolean; onChange: (checked: boolean) => void; label?: string; disabled?: boolean };

/** On/off toggle. Use for settings that apply immediately; use a checkbox inside forms that need Save. */
export function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2 outline-none disabled:opacity-50"
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors group-focus-visible:ring-2 group-focus-visible:ring-muted/60",
          checked ? "border-fg bg-fg" : "border-border bg-hover",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full transition-all",
            checked ? "left-[18px] bg-bg" : "left-0.5 bg-muted",
          )}
        />
      </span>
      {label && <span className="text-[13px] text-fg">{label}</span>}
    </button>
  );
}
