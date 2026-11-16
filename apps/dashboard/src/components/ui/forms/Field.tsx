import type { ReactNode } from "react";
import { cn } from "../../../lib/cn.ts";

type Props = { label: string; hint?: ReactNode; error?: string | null | undefined; className?: string; children: ReactNode };

/** Label + control + hint (or error). Wrapping in <label> ties the text to the control. */
export function Field({ label, hint, error, className, children }: Props) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
