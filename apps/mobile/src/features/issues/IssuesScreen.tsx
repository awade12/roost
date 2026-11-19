import { useState } from "react";
import { View } from "react-native";
import { Empty, ErrorState, Loading } from "../../components/data/States.tsx";
import { TabScreen } from "../../components/layout/TabScreen.tsx";
import { Segmented } from "../../components/ui/Segmented.tsx";
import { TabHeader } from "../tabs/index.ts";
import { useWorkspace } from "../workspace/index.ts";
import { IssueRow } from "./IssueRow.tsx";
import { useIssues, type IssueStatus } from "./use-issues.ts";

const TABS: { value: IssueStatus; label: string }[] = [
  { value: "unresolved", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
];

export function IssuesScreen() {
  const { environment } = useWorkspace();
  const [status, setStatus] = useState<IssueStatus>("unresolved");
  const issues = useIssues(environment?.id ?? null, status);
  const count = status === "unresolved" && issues.data ? `${issues.data.length} open` : undefined;
  return (
    <TabScreen header={<TabHeader />} title="Issues" count={count} onRefresh={() => issues.refetch()}>
      <Segmented options={TABS} value={status} onChange={setStatus} />
      {!environment ? <Empty title="No game selected" body="Tap the game at the top to pick one." /> : null}
      {issues.isLoading ? <Loading /> : null}
      {issues.error ? <ErrorState error={issues.error} onRetry={() => void issues.refetch()} /> : null}
      {issues.data?.length === 0 ? <Empty title={status === "unresolved" ? "No open issues" : `No ${status} issues`} body="Crashes and errors the game reports are grouped here." /> : null}
      {issues.data?.length ? (
        <View className="-mt-2">
          {issues.data.map((issue, i) => (
            <IssueRow key={issue.id} issue={issue} last={i === issues.data.length - 1} />
          ))}
        </View>
      ) : null}
    </TabScreen>
  );
}
