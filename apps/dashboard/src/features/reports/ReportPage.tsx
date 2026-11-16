import { Link } from "@tanstack/react-router";
import { Button, Card, CopyButton, EmptyState } from "../../components/ui/index.ts";
import { formatAgo } from "../../lib/format.ts";
import { useCurrentOrg } from "../studio/index.ts";
import { useReport, useSetReportStatus } from "./api/use-reports.ts";
import { ReportData } from "./components/ReportData.tsx";
import { ReportFiles } from "./components/ReportFiles.tsx";

export function ReportPage({ reportId }: { reportId: string }) {
  const org = useCurrentOrg();
  const data = useReport(reportId);
  const setStatus = useSetReportStatus(reportId);
  if (data.isPending) return <p className="px-8 py-6 text-muted">Loading report…</p>;
  if (data.isError) {
    return (
      <Card className="mx-8 my-6">
        <EmptyState title="Report not found">{data.error.message}</EmptyState>
      </Card>
    );
  }
  const { report, attachments } = data.data;
  const canEdit = org?.role !== "viewer";
  const open = report.status === "open";

  return (
    <div className="flex max-w-4xl flex-col gap-5 px-8 py-6">
      <Link to="/reports" className="text-sm text-muted hover:text-fg">
        ← Player reports
      </Link>
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{report.message}</p>
          {canEdit && (
            <Button
              variant={open ? "primary" : "secondary"}
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate(open ? "closed" : "open")}
            >
              {open ? "Close" : "Reopen"}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="capitalize">{report.category}</span>
          <span>{formatAgo(report.receivedAt)}</span>
          {report.issueId && report.issueNumber !== null && (
            <Link
              to="/issues/$issueId"
              params={{ issueId: report.issueId }}
              className="text-fg hover:underline"
            >
              Issue #{report.issueNumber}
            </Link>
          )}
          {report.email && (
            <span className="flex items-center gap-1.5">
              Reply to <span className="font-mono text-fg">{report.email}</span>
              <CopyButton text={report.email} />
            </span>
          )}
        </div>
        {setStatus.error && <p className="text-xs text-danger">{setStatus.error.message}</p>}
      </Card>
      <ReportFiles files={attachments} />
      <ReportData report={report} />
    </div>
  );
}
