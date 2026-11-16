import { Link } from "@tanstack/react-router";
import { formatAgo } from "../../../lib/format.ts";
import type { ReportSummary } from "../api/use-reports.ts";

const CATEGORY: Record<ReportSummary["category"], string> = {
  bug: "Bug",
  feedback: "Feedback",
  crash: "Crash",
  other: "Other",
};

export function ReportList({ reports }: { reports: ReportSummary[] }) {
  return (
    <ul className="divide-y divide-border">
      {reports.map((r) => (
        <li key={r.id}>
          <Link
            to="/reports/$reportId"
            params={{ reportId: r.id }}
            className="flex h-14 items-center gap-4 px-4 hover:bg-hover"
          >
            <span className="w-16 shrink-0 text-xs text-muted">{CATEGORY[r.category]}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{r.message}</span>
              <span className="truncate text-xs text-muted">
                {r.playerId} · {r.platform} · build {r.build}
                {r.attachmentCount > 0 &&
                  ` · ${r.attachmentCount} file${r.attachmentCount === 1 ? "" : "s"}`}
                {r.hasEmail && " · can reply"}
              </span>
            </div>
            <span className="w-20 shrink-0 text-right text-xs text-muted">
              {formatAgo(r.receivedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
