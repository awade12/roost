import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CopyButton } from "../../components/ui/index.ts";
import { useCurrentOrg } from "../studio/index.ts";
import { useIssueEvent, useIssueEvents } from "./api/use-issue-events.ts";
import { useIssue } from "./api/use-issues.ts";
import { Activity } from "./components/detail/Activity.tsx";
import { EventData } from "./components/detail/EventData.tsx";
import { Breadcrumbs, EventNavigator, StackTrace } from "./components/detail/EventPanel.tsx";
import { IssueSidebar } from "./components/detail/IssueSidebar.tsx";
import { groupOf, StatusIcon } from "./components/list/StatusIcon.tsx";

function EventSection({ issueId }: { issueId: string }) {
  const events = useIssueEvents(issueId);
  const [index, setIndex] = useState(0);
  const event = useIssueEvent(issueId, events.data?.[index]?.id ?? null);
  if (events.isPending) return <p className="text-muted">Loading events…</p>;
  if (!events.data?.length) return <p className="text-muted">No events stored for this issue.</p>;
  return (
    <>
      <EventNavigator events={events.data} index={index} onIndex={setIndex} />
      {event.isError && <p className="text-danger">{event.error.message}</p>}
      {event.data && (
        <>
          <StackTrace event={event.data} />
          <Breadcrumbs event={event.data} />
          <EventData event={event.data} />
        </>
      )}
    </>
  );
}

export function IssuePage() {
  const { issueId } = useParams({ from: "/issues/$issueId" });
  const issue = useIssue(issueId);
  const canEdit = (useCurrentOrg()?.role ?? "viewer") !== "viewer";
  if (issue.isPending) return <p className="px-8 py-6 text-muted">Loading…</p>;
  if (issue.isError) return <p className="px-8 py-6 text-danger">{issue.error.message}</p>;
  const { issue: i } = issue.data;
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex flex-col gap-2 border-b border-border px-8 py-5">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link to="/issues" className="hover:text-fg">Issues</Link>
            <span className="text-faint">/</span>
            <span className="font-mono">#{i.number}</span>
            <StatusIcon group={groupOf(i)} />
            <CopyButton text={window.location.href} label="Copy link" className="ml-auto h-7 px-2 text-xs" />
          </div>
          <h1 className="text-xl leading-7 font-semibold tracking-tight">{i.type}: <span className="font-normal">{i.message}</span></h1>
          {i.culprit && <p className="font-mono text-xs text-muted">{i.culprit}</p>}
        </header>
        <div className="flex flex-col gap-4 px-8 py-6">
          <EventSection issueId={i.id} />
          <Activity issueId={i.id} />
        </div>
      </div>
      <IssueSidebar data={issue.data} canEdit={canEdit} />
    </div>
  );
}
