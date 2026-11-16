import { useState } from "react";
import { Card, EmptyState, Segmented } from "../../components/ui/index.ts";
import { useCurrentOrg, useEnvironment, useMembers } from "../studio/index.ts";
import { useIssues, type IssueStatus } from "./api/use-issues.ts";
import { IssueList } from "./components/list/IssueList.tsx";

const TABS: { value: IssueStatus; label: string }[] = [
  { value: "unresolved", label: "Unresolved" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
];

const EMPTY: Record<IssueStatus, string> = {
  unresolved: "No open crashes or errors. Reports from the SDK show up here, grouped by cause.",
  resolved: "Nothing resolved yet.",
  ignored: "Nothing ignored.",
};

function Issues({ environmentId }: { environmentId: string }) {
  const [status, setStatus] = useState<IssueStatus>("unresolved");
  const issues = useIssues(environmentId, status);
  const members = useMembers(useCurrentOrg()?.id);
  const names = new Map((members.data ?? []).map((m) => [m.id, m.email]));
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center border-b border-border px-6">
        <Segmented label="Issue status" options={TABS} value={status} onChange={setStatus} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {issues.isPending && <p className="p-6 text-muted">Loading…</p>}
        {issues.isError && <p className="p-6 text-danger">{issues.error.message}</p>}
        {issues.data?.length === 0 && <EmptyState title="All clear">{EMPTY[status]}</EmptyState>}
        <IssueList issues={issues.data ?? []} grouped={status === "unresolved"} members={names} />
      </div>
    </div>
  );
}

export function IssuesPage() {
  const { selected, games } = useEnvironment();
  if (games.isPending) return <p className="px-8 py-6 text-muted">Loading…</p>;
  if (!selected) {
    return (
      <Card className="mx-8 my-6">
        <EmptyState title="No game yet">Create a game in Games &amp; keys to start receiving crash reports.</EmptyState>
      </Card>
    );
  }
  return <Issues environmentId={selected.env.id} />;
}
