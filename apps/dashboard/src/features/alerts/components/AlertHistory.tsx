import { Link } from "@tanstack/react-router";
import { formatAgo } from "../../../lib/format.ts";
import type { AlertFiring } from "../api/use-alerts.ts";

/** Latest alerts sent, with delivery problems up front so a broken webhook gets noticed. */
export function AlertHistory({ history }: { history: AlertFiring[] }) {
  if (history.length === 0) return <p className="px-4 py-4 text-muted">No alerts sent yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {history.map((f) => (
        <li key={f.id} className="flex h-11 items-center gap-3 px-4">
          <span
            className={`size-1.5 shrink-0 rounded-full ${f.error ? "bg-danger" : "bg-ok"}`}
            aria-label={f.error ? "Failed" : "Delivered"}
          />
          <Link
            to="/issues/$issueId"
            params={{ issueId: f.issueId }}
            className="min-w-0 flex-1 truncate hover:underline"
          >
            <span className="font-mono text-xs text-muted">#{f.issueNumber}</span> {f.issueType}:{" "}
            {f.issueMessage}
          </Link>
          <span className="hidden w-40 truncate text-xs text-muted md:inline">{f.ruleName}</span>
          {f.error ? (
            <span className="w-48 truncate text-xs text-danger">{f.error}</span>
          ) : (
            <span className="w-48 text-xs text-muted">Sent to {f.delivered}</span>
          )}
          <span className="w-20 shrink-0 text-right text-xs text-muted">
            {formatAgo(f.firedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
