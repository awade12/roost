import type { ReactNode } from "react";

/** Centered message for lists, charts and pages that have nothing to show yet. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-sm text-[13px] leading-5 text-muted">{children}</div>}
    </div>
  );
}
