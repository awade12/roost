import { useState } from "react";
import { Card, EmptyState, Segmented } from "../../components/ui/index.ts";
import { useEnvironment } from "../studio/index.ts";
import { useReports, type ReportStatus } from "./api/use-reports.ts";
import { ReportList } from "./components/ReportList.tsx";

/** Bug reports players sent from inside the game, for the selected environment. */
export function ReportsPage() {
  const { selected } = useEnvironment();
  const [status, setStatus] = useState<ReportStatus>("open");
  const reports = useReports(selected?.env.id ?? "", status);

  return (
    <div className="flex max-w-4xl flex-col gap-5 px-8 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">Player reports</h1>
          <p className="text-muted">
            What players wrote in "Report a bug", with their screenshot, save and what they did
            before. Send them with <code className="font-mono text-xs">roost.report()</code>.
          </p>
        </div>
        <Segmented
          label="Status"
          options={[
            { value: "open" as const, label: "Open" },
            { value: "closed" as const, label: "Closed" },
          ]}
          value={status}
          onChange={setStatus}
        />
      </div>
      <Card>
        {!selected && (
          <EmptyState title="No games yet">Create a game under Settings first.</EmptyState>
        )}
        {reports.isPending && selected && <p className="px-4 py-3 text-muted">Loading reports…</p>}
        {reports.isError && <p className="px-4 py-3 text-danger">{reports.error.message}</p>}
        {reports.data?.length === 0 && (
          <EmptyState title={status === "open" ? "No open reports" : "No closed reports"}>
            {status === "open"
              ? "When players send a report from the game, it shows up here."
              : "Closed reports show up here."}
          </EmptyState>
        )}
        {reports.data && reports.data.length > 0 && <ReportList reports={reports.data} />}
      </Card>
    </div>
  );
}
