import { cn } from "../../../../lib/cn.ts";

/** Swatch per label color name (stored on the label). */
export const LABEL_DOT: Record<string, string> = {
  gray: "bg-neutral-400",
  blue: "bg-blue-400",
  green: "bg-emerald-400",
  yellow: "bg-yellow-300",
  orange: "bg-orange-400",
  red: "bg-red-400",
  purple: "bg-violet-400",
  pink: "bg-pink-400",
};

export function LabelChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-border px-2 text-[11px] text-fg", className)}>
      <span className={cn("size-1.5 rounded-full", LABEL_DOT[color] ?? LABEL_DOT.gray)} />
      {name}
    </span>
  );
}
