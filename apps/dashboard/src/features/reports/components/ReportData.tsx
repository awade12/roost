import { Card, CardHeader } from "../../../components/ui/index.ts";
import type { ReportDetail } from "../api/use-reports.ts";

type Report = ReportDetail["report"];
type Crumb = { name: string; ts: string; category?: string; message?: string };
const display = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

function Rows({ entries }: { entries: [string, unknown][] }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 p-4 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-muted">{k}</dt>
          <dd className="min-w-0 font-mono break-all">{display(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Device, tags, contexts, extra and what the player did before writing it. */
export function ReportData({ report }: { report: Report }) {
  const sentAt = new Date(report.reportedAt).getTime();
  const crumbs = report.breadcrumbs as Crumb[];
  const device: [string, unknown][] = [
    ["Player", report.playerId],
    ["Build", report.build],
    ["Platform", [report.platform, report.osVersion].filter(Boolean).join(" ")],
    ...(report.deviceModel ? [["Device", report.deviceModel] as [string, unknown]] : []),
    ...(report.sessionId ? [["Session", report.sessionId] as [string, unknown]] : []),
  ];
  return (
    <>
      <Card>
        <CardHeader title="Device" />
        <Rows entries={device} />
      </Card>
      {Object.keys(report.tags).length > 0 && (
        <Card>
          <CardHeader title="Tags" />
          <Rows entries={Object.entries(report.tags)} />
        </Card>
      )}
      {Object.entries(report.contexts).map(([name, data]) => (
        <Card key={name}>
          <CardHeader title={name} />
          <Rows entries={Object.entries(data)} />
        </Card>
      ))}
      {Object.keys(report.extra).length > 0 && (
        <Card>
          <CardHeader title="Extra" />
          <Rows entries={Object.entries(report.extra)} />
        </Card>
      )}
      <BeforeReport crumbs={crumbs} sentAt={sentAt} />
    </>
  );
}

function BeforeReport({ crumbs, sentAt }: { crumbs: Crumb[]; sentAt: number }) {
  return (
    <Card>
      <CardHeader title="Before the report" />
      {crumbs.length === 0 ? (
        <p className="p-4 text-xs text-muted">No breadcrumbs.</p>
      ) : (
        <ol className="flex flex-col py-2">
          {crumbs.map((b, i) => (
            <li key={i} className="flex items-baseline gap-3 px-4 py-1 hover:bg-hover">
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted">
                {((new Date(b.ts).getTime() - sentAt) / 1000).toFixed(1)}s
              </span>
              {b.category && (
                <span className="w-16 shrink-0 truncate text-[11px] text-muted">{b.category}</span>
              )}
              <span className="font-mono text-xs">{b.name}</span>
              {b.message && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{b.message}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
