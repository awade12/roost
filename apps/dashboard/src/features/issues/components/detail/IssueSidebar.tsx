import type { ReactNode } from "react";
import { Button, Select } from "../../../../components/ui/index.ts";
import { formatAgo, formatNumber, formatPercent } from "../../../../lib/format.ts";
import { useSendToLinear } from "../../api/use-issue-collab.ts";
import { useSetIssueStatus, type IssueDetailData, type IssueStatus } from "../../api/use-issues.ts";
import { AssigneeSelect } from "../fields/AssigneeSelect.tsx";
import { LabelPicker } from "../fields/LabelPicker.tsx";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-border px-5 py-4 last:border-0">
      <h3 className="text-xs font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Bars({ items, total }: { items: { name: string; count: number }[]; total: number }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <li key={i.name} className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="truncate font-mono">{i.name || "—"}</span>
            <span className="text-muted">{formatPercent(i.count / Math.max(total, 1), 0)}</span>
          </div>
          <div className="h-1 rounded-full bg-hover">
            <div className="h-full rounded-full bg-faint" style={{ width: `${(i.count / Math.max(total, 1)) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Linear({ issue }: { issue: IssueDetailData["issue"] }) {
  const send = useSendToLinear(issue.id);
  if (issue.linearUrl) {
    return (
      <a href={issue.linearUrl} target="_blank" rel="noreferrer" className="font-mono text-xs underline-offset-2 hover:underline">
        {issue.linearIdentifier} ↗
      </a>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button className="h-7 self-start" disabled={send.isPending} onClick={() => send.mutate()}>
        {send.isPending ? "Sending…" : "Send to Linear"}
      </Button>
      {send.error && <p className="text-xs text-danger">{send.error.message}</p>}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "unresolved" as const, label: "Unresolved" },
  { value: "resolved" as const, label: "Resolved" },
  { value: "ignored" as const, label: "Ignored" },
];

export function IssueSidebar({ data, canEdit }: { data: IssueDetailData; canEdit: boolean }) {
  const { issue, detail, tags } = data;
  const setStatus = useSetIssueStatus();
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border">
      <Section title="Status">
        <Select aria-label="Status" size="sm" disabled={!canEdit} value={issue.status} options={STATUS_OPTIONS} onChange={(status: IssueStatus) => setStatus.mutate({ issueId: issue.id, status })} />
      </Section>
      <Section title="Assignee">
        <AssigneeSelect issueId={issue.id} assigneeId={issue.assigneeId} disabled={!canEdit} />
      </Section>
      <Section title="Labels">
        <LabelPicker gameId={data.gameId} issueId={issue.id} current={issue.labels} disabled={!canEdit} />
      </Section>
      <Section title="Linear">{canEdit || issue.linearUrl ? <Linear issue={issue} /> : <span className="text-xs text-muted">Not linked</span>}</Section>
      <Section title="Impact">
        <p className="font-mono text-xs">{formatNumber(detail.events)} events · {formatNumber(detail.players)} players</p>
        <p className="text-xs text-muted">First seen {formatAgo(issue.firstSeenAt)} in <span className="font-mono">{issue.firstBuild}</span></p>
        <p className="text-xs text-muted">Last seen {formatAgo(issue.lastSeenAt)} in <span className="font-mono">{issue.lastBuild}</span></p>
      </Section>
      {detail.platforms.length > 0 && <Section title="Platforms"><Bars items={detail.platforms} total={detail.events} /></Section>}
      {detail.builds.length > 0 && <Section title="Builds"><Bars items={detail.builds} total={detail.events} /></Section>}
      {tags.map((t) => (
        <Section key={t.key} title={`Tag · ${t.key}`}>
          <Bars items={t.values.map((v) => ({ name: v.value, count: v.count }))} total={detail.events} />
        </Section>
      ))}
    </aside>
  );
}
