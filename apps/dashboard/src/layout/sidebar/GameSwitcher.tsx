import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.ts";
import {
  selectEnvironment,
  useEnvironment,
  type Environment,
  type Game,
} from "../../features/studio/index.ts";

const ENV_ORDER = ["production", "staging", "development"];
const SHORT: Record<string, string> = { production: "prod", development: "dev" };
const rank = (e: Environment) =>
  ENV_ORDER.includes(e.name) ? ENV_ORDER.indexOf(e.name) : ENV_ORDER.length;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();

function Tile({ name }: { name: string }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-fg text-[10px] font-bold text-bg">
      {initials(name)}
    </span>
  );
}

const Chevron = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="shrink-0 text-muted"
  >
    <path d="M3.5 4.5L6 2l2.5 2.5M3.5 7.5L6 10l2.5-2.5" />
  </svg>
);

/** Switching game lands on its production environment, the one people look at most. */
function pickGame(game: Game) {
  const env = [...game.environments].sort((a, b) => rank(a) - rank(b))[0];
  if (env) selectEnvironment(env.id);
}

function GameMenu({
  games,
  current,
  onClose,
}: {
  games: Game[];
  current: string;
  onClose: () => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Games"
      className="absolute inset-x-0 top-9 z-20 flex flex-col gap-px rounded-md border border-border bg-panel p-1 shadow-xl shadow-black/40"
    >
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          role="option"
          aria-selected={g.id === current}
          onClick={() => {
            pickGame(g);
            onClose();
          }}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded px-2 text-left text-[13px] hover:bg-hover",
            g.id === current && "bg-hover font-medium",
          )}
        >
          <Tile name={g.name} />
          <span className="truncate">{g.name}</span>
        </button>
      ))}
      <Link
        to="/settings/games"
        onClick={onClose}
        className="mt-1 border-t border-border px-2 pt-2 pb-1 text-xs text-muted hover:text-fg"
      >
        Manage games
      </Link>
    </div>
  );
}

function EnvTabs({ envs, current }: { envs: Environment[]; current: string }) {
  return (
    <div
      role="radiogroup"
      aria-label="Environment"
      className="flex gap-0.5 rounded-[7px] border border-border bg-bg p-0.5"
    >
      {envs.map((e) => (
        <button
          key={e.id}
          type="button"
          role="radio"
          aria-checked={e.id === current}
          title={e.name}
          onClick={() => selectEnvironment(e.id)}
          className={cn(
            "flex h-6 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-1 text-xs",
            e.id === current ? "bg-hover text-fg" : "text-muted hover:text-fg",
          )}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              e.name === "production" ? "bg-ok" : "bg-faint",
            )}
          />
          <span className="truncate">{SHORT[e.name] ?? e.name}</span>
        </button>
      ))}
    </div>
  );
}

/** Which game and environment every page shows: a game menu, then environment tabs. */
export function GameSwitcher() {
  const { games, selected } = useEnvironment();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!games.data || !selected) return null;
  const envs = [...selected.game.environments].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="flex flex-col gap-2">
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-full items-center gap-2.5 rounded-md bg-hover px-2 text-left transition-colors hover:bg-border"
        >
          <Tile name={selected.game.name} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {selected.game.name}
          </span>
          <Chevron />
        </button>
        {open && (
          <GameMenu games={games.data} current={selected.game.id} onClose={() => setOpen(false)} />
        )}
      </div>
      <EnvTabs envs={envs} current={selected.env.id} />
    </div>
  );
}
