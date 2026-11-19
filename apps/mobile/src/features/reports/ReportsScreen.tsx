import { useState } from "react";
import { View } from "react-native";
import { Empty, ErrorState, Loading } from "../../components/data/States.tsx";
import { TabScreen } from "../../components/layout/TabScreen.tsx";
import { Chip } from "../../components/ui/Chip.tsx";
import { TabHeader } from "../tabs/index.ts";
import { useWorkspace } from "../workspace/index.ts";
import { ReportRow } from "./ReportRow.tsx";
import { useReports, type ReportStatus } from "./use-reports.ts";

type Filter = ReportStatus | "attached";

export function ReportsScreen() {
  const { environment } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("open");
  const reports = useReports(environment?.id ?? null, filter === "closed" ? "closed" : "open");
  const rows = filter === "attached" ? reports.data?.filter((r) => r.attachmentCount > 0) : reports.data;
  const open = filter !== "closed" && reports.data ? `${reports.data.length} open` : undefined;
  return (
    <TabScreen header={<TabHeader />} title="Reports" count={open} onRefresh={() => reports.refetch()}>
      <View className="flex-row gap-2">
        <Chip label="Open" selected={filter === "open"} onPress={() => setFilter("open")} />
        <Chip label="With attachments" selected={filter === "attached"} onPress={() => setFilter("attached")} />
        <Chip label="Closed" selected={filter === "closed"} onPress={() => setFilter("closed")} />
      </View>
      {reports.isLoading ? <Loading /> : null}
      {reports.error ? <ErrorState error={reports.error} onRetry={() => void reports.refetch()} /> : null}
      {rows?.length === 0 ? <Empty title={filter === "closed" ? "No closed reports" : "No reports"} body="When players send a bug report from the game, it lands here." /> : null}
      {rows?.length ? (
        <View className="-mt-2">
          {rows.map((r, i) => (
            <ReportRow key={r.id} report={r} last={i === rows.length - 1} />
          ))}
        </View>
      ) : null}
    </TabScreen>
  );
}
