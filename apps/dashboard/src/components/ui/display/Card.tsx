import type { ReactNode } from "react";
import { cn } from "../../../lib/cn.ts";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-lg border border-border bg-panel", className)}>{children}</section>;
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex h-11 items-center justify-between border-b border-border px-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {action}
    </header>
  );
}
