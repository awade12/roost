import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { cn } from "../../../lib/cn.ts";

/** Shared look for every text control: hairline border, brighter on hover/focus, red when invalid. */
export const fieldFrame =
  "rounded-md border border-border bg-bg text-[13px] text-fg transition-colors hover:border-[#333] focus-within:border-muted focus-within:ring-2 focus-within:ring-white/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[[aria-invalid=true]]:border-danger";

const heights = { sm: "h-7 px-2.5", md: "h-9 px-3", lg: "h-11 px-3.5 text-sm" };

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & {
  size?: keyof typeof heights;
  mono?: boolean;
  /** Shown inside the box, before the text: an icon or a fixed prefix like "https://". */
  prefix?: ReactNode;
  /** Shown inside the box, after the text: a unit like "tokens" or a button. */
  suffix?: ReactNode;
  invalid?: boolean;
  /** Classes for the <input> itself (className styles the outer box). */
  inputClassName?: string;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ size = "md", mono, prefix, suffix, invalid, className, inputClassName, ...props }: InputProps) {
  return (
    <div className={cn(fieldFrame, heights[size], "flex items-center gap-2", className)}>
      {prefix && <span className="flex shrink-0 items-center text-muted">{prefix}</span>}
      <input
        aria-invalid={invalid || undefined}
        className={cn("h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint", mono && "font-mono", inputClassName)}
        {...props}
      />
      {suffix && <span className="flex shrink-0 items-center text-xs text-muted">{suffix}</span>}
    </div>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean; invalid?: boolean; ref?: Ref<HTMLTextAreaElement> };

export function Textarea({ mono, invalid, className, ...props }: TextareaProps) {
  return (
    <div className={cn(fieldFrame, "flex")}>
      <textarea
        aria-invalid={invalid || undefined}
        className={cn("min-h-20 w-full resize-y bg-transparent px-3 py-2 leading-5 outline-none placeholder:text-faint", mono && "font-mono text-xs", className)}
        {...props}
      />
    </div>
  );
}
