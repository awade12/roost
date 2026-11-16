import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../lib/cn.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

const widths = { sm: "max-w-[420px]", md: "max-w-[520px]", lg: "max-w-[680px]" };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select,[tabindex]:not([tabindex="-1"])';

// Open dialogs, innermost last. Only the top one handles Escape/Tab, so closing a
// confirm opened from inside an editor doesn't close the editor too.
const openStack: symbol[] = [];

/** Keeps Tab inside the dialog, closes on Escape, and puts focus back where it was. */
function useModalFocus(open: boolean, panel: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const token = Symbol("dialog");
    openStack.push(token);
    const before = document.activeElement as HTMLElement | null;
    const focusables = () => [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    (focusables()[0] ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (openStack.at(-1) !== token) return;
      if (e.key === "Escape") return close.current();
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items.at(-1);
      const wrapTo = e.shiftKey ? (document.activeElement === first ? last : null) : document.activeElement === last ? first : null;
      if (wrapTo) {
        e.preventDefault();
        wrapTo.focus();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      openStack.splice(openStack.indexOf(token), 1);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, [open, panel]);
}

/** Modal dialog rendered in a portal. Backdrop click and Escape close it. */
export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(open, panel, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal aria-labelledby={titleId} tabIndex={-1} className={cn("flex max-h-[90vh] w-full flex-col rounded-lg border border-border bg-panel shadow-2xl shadow-black/50 outline-none", widths[size])}>
        <header className="flex flex-col gap-1 px-5 pt-5">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          {description && <div className="text-[13px] leading-5 text-muted">{description}</div>}
        </header>
        {children && <div className="flex flex-col gap-4 overflow-y-auto px-5 pt-4">{children}</div>}
        <footer className="flex items-center justify-end gap-2 px-5 py-4">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}
