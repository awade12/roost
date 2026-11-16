import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../../lib/cn.ts";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg font-medium hover:bg-white",
  secondary: "border border-border text-fg hover:bg-hover",
  ghost: "text-muted hover:text-fg hover:bg-hover",
  danger: "bg-danger text-white font-medium hover:bg-danger/85",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-muted/60 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
