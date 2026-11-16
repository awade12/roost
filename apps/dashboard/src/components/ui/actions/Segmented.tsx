import { cn } from "../../../lib/cn.ts";

type Props<T extends string | number> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** Small segmented control, e.g. a 7d / 30d / 90d range. */
export function Segmented<T extends string | number>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-7 items-center gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded px-2.5 text-xs transition-colors",
            o.value === value ? "bg-hover font-medium text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
