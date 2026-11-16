import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../../../lib/cn.ts";
import { fieldFrame } from "./Input.tsx";

export type SelectOption<T extends string> = { value: T; label: string; group?: string; hint?: string };

type Props<T extends string> = {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  "aria-label"?: string;
  size?: "sm" | "md";
  /** Which edge the menu lines up with. */
  align?: "start" | "end";
  disabled?: boolean;
  className?: string;
};

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    <path d="M3.5 4.5L6 2l2.5 2.5M3.5 7.5L6 10l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Keyboard handling for the open list: arrows, Home/End, Enter/Space, Escape/Tab, type-to-jump. */
function useListKeys<T extends string>(options: SelectOption<T>[], active: number, setActive: (i: number) => void, choose: (i: number) => void, close: () => void) {
  const typed = useRef({ text: "", at: 0 });
  return (e: KeyboardEvent) => {
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(active + 1, last), ArrowUp: Math.max(active - 1, 0), Home: 0, End: last };
    if (e.key in moves) setActive(moves[e.key] ?? 0);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape" || e.key === "Tab") close();
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
      return;
    } else return;
    e.preventDefault();
  };
}

type ListProps<T extends string> = {
  listRef: React.RefObject<HTMLUListElement | null>;
  id: string;
  options: SelectOption<T>[];
  value: T | null;
  active: number;
  align: "start" | "end";
  onKey: (e: KeyboardEvent) => void;
  onHover: (i: number) => void;
  onChoose: (i: number) => void;
};

function OptionList<T extends string>({ listRef, id, options, value, active, align, onKey, onHover, onChoose }: ListProps<T>) {
  return (
    <ul
      ref={listRef}
      id={`${id}-list`}
      role="listbox"
      tabIndex={-1}
      aria-activedescendant={`${id}-${active}`}
      onKeyDown={onKey}
      className={cn("absolute z-50 mt-1 max-h-72 min-w-full overflow-y-auto rounded-lg border border-border bg-panel p-1 shadow-xl shadow-black/40 outline-none", align === "end" ? "right-0" : "left-0")}
    >
      {options.map((o, i) => (
        <li key={o.value} role="presentation">
          {o.group && o.group !== options[i - 1]?.group && <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted">{o.group}</div>}
          <div
            id={`${id}-${i}`}
            role="option"
            aria-selected={o.value === value}
            onPointerMove={() => onHover(i)}
            onClick={() => onChoose(i)}
            className={cn("flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] whitespace-nowrap", i === active && "bg-hover")}
          >
            <span className="w-3.5 shrink-0 text-fg">{o.value === value && <Check />}</span>
            <span className="flex-1">{o.label}</span>
            {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

type PopupArgs = {
  open: boolean;
  active: number;
  id: string;
  root: React.RefObject<HTMLDivElement | null>;
  list: React.RefObject<HTMLUListElement | null>;
  dismiss: () => void;
};

/** While open: focus the list, close on outside clicks, keep the active option in view. */
function usePopup({ open, active, id, root, list, dismiss }: PopupArgs) {
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) dismiss();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
    // dismiss is a fresh closure each render; only (re)subscribe when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
}

/** Custom dropdown (ARIA listbox). Replaces native <select> so it matches the rest of the UI. */
export function Select<T extends string>({ value, onChange, options, placeholder = "Select…", size = "md", align = "start", disabled, className, ...aria }: Props<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  const show = () => {
    setActive(Math.max(options.findIndex((o) => o.value === value), 0));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (i: number) => {
    const option = options[i];
    if (option) onChange(option.value);
    close();
  };
  const onListKey = useListKeys(options, active, setActive, choose, close);

  usePopup({ open, active, id, root, list, dismiss: () => setOpen(false) });

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        {...aria}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) return;
          e.preventDefault();
          show();
        }}
        className={cn(fieldFrame, size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3", "flex w-full items-center justify-between gap-2 text-left outline-none focus-visible:border-muted")}
      >
        <span className={cn("truncate", !selected && "text-faint")}>{selected?.label ?? placeholder}</span>
        <span className="shrink-0 text-muted">
          <Chevron />
        </span>
      </button>
      {open && (
        <OptionList listRef={list} id={id} options={options} value={value} active={active} align={align} onKey={onListKey} onHover={setActive} onChoose={choose} />
      )}
    </div>
  );
}
