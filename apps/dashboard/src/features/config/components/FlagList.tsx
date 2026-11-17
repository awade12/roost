import { formatAgo } from "../../../lib/format.ts";
import type { Flag } from "../api/use-flags.ts";

const TYPE: Record<Flag["type"], string> = { boolean: "on/off", string: "text", number: "number", json: "json" };

function Value({ flag, value }: { flag: Flag; value: unknown }) {
  if (flag.type === "boolean") return <span className={value ? "text-ok" : "text-muted"}>{value ? "On" : "Off"}</span>;
  const text = flag.type === "json" ? JSON.stringify(value) : String(value);
  return <span className="truncate font-mono">{text}</span>;
}

/** Each flag on one line: what everyone gets, and who gets something else. */
export function FlagList({ flags, onOpen }: { flags: Flag[]; onOpen: (f: Flag) => void }) {
  return (
    <ul className="divide-y divide-border">
      {flags.map((f) => {
        const overrides = Object.keys(f.overrides).length;
        return (
          <li key={f.id}>
            <button type="button" onClick={() => onOpen(f)} className="flex h-14 w-full items-center gap-4 px-4 text-left hover:bg-hover">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-xs">{f.key}</span>
                <span className="truncate text-xs text-muted">{f.description || TYPE[f.type]}</span>
              </div>
              <span className="flex w-40 min-w-0 justify-end text-xs">
                <Value flag={f} value={f.value} />
              </span>
              <span className="flex w-44 items-center justify-end gap-2 text-xs text-muted">
                {f.rollout ? (
                  <>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hover">
                      <span className="block h-full bg-chart" style={{ width: `${f.rollout.percent}%` }} />
                    </span>
                    <span className="flex min-w-0 gap-1">
                      {f.rollout.percent}% get <Value flag={f} value={f.rollout.value} />
                    </span>
                  </>
                ) : (
                  "Everyone"
                )}
              </span>
              <span className="w-20 text-right text-xs text-muted">{overrides ? `${overrides} override${overrides === 1 ? "" : "s"}` : ""}</span>
              <span className="w-20 text-right text-xs text-muted">{formatAgo(f.updatedAt)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
