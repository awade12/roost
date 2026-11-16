import { Link } from "@tanstack/react-router";
import { formatAgo, formatNumber } from "../../../../lib/format.ts";
import type { IssueRow } from "../../api/use-issues.ts";
import { LabelChip } from "./LabelChip.tsx";
import { GROUP_LABEL, groupOf, StatusIcon, type IssueGroup } from "./StatusIcon.tsx";

function Row({ issue, assignee }: { issue: IssueRow; assignee: string | undefined }) {
  return (
    <Link
      to="/issues/$issueId"
      params={{ issueId: issue.id }}
      className="flex h-11 w-full items-center gap-3 border-b border-border px-6 text-left hover:bg-hover"
    >
      <span className="w-12 shrink-0 font-mono text-xs text-muted">#{issue.number}</span>
      <span className="min-w-0 flex-1 truncate">
        {issue.type}: <span className="text-muted">{issue.message}</span>
      </span>
      {issue.labels.map((l) => (
        <LabelChip key={l.id} name={l.name} color={l.color} />
      ))}
      {issue.linearIdentifier && <span className="shrink-0 font-mono text-[11px] text-muted">{issue.linearIdentifier}</span>}
      <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted">{issue.lastBuild}</span>
      <span className="w-14 shrink-0 text-right font-mono text-xs" title={`${issue.players} players, last 30 days`}>
        {formatNumber(issue.events)}
      </span>
      <span className="w-6 shrink-0" title={assignee ? `Assigned to ${assignee}` : "Unassigned"}>
        {assignee && (
          <span className="flex size-5 items-center justify-center rounded-full border border-border text-[10px] uppercase">{assignee.charAt(0)}</span>
        )}
      </span>
      <span className="w-20 shrink-0 text-right text-xs text-muted">{formatAgo(issue.lastSeenAt)}</span>
    </Link>
  );
}

type Props = { issues: IssueRow[]; grouped: boolean; members: Map<string, string> };

export function IssueList({ issues, grouped, members }: Props) {
  const row = (i: IssueRow) => <Row key={i.id} issue={i} assignee={i.assigneeId ? members.get(i.assigneeId) : undefined} />;
  if (!grouped) return issues.map(row);
  const groups: IssueGroup[] = ["regressed", "new", "ongoing"];
  return groups.map((group) => {
    const rows = issues.filter((i) => groupOf(i) === group);
    if (rows.length === 0) return null;
    return (
      <section key={group}>
        <h3 className="flex h-8 items-center gap-2 border-b border-border bg-panel px-6 text-xs font-medium">
          <StatusIcon group={group} />
          {GROUP_LABEL[group]}
          <span className="font-mono text-[11px] font-normal text-muted">{rows.length}</span>
        </h3>
        {rows.map(row)}
      </section>
    );
  });
}
