import { Text, View } from "react-native";
import { StatRow } from "../../components/data/StatRow.tsx";
import { ErrorState, Loading } from "../../components/data/States.tsx";
import { ActionBar } from "../../components/layout/ActionBar.tsx";
import { StackScreen } from "../../components/layout/StackScreen.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { formatAgo, formatNumber } from "../../lib/format.ts";
import { Breadcrumbs } from "./detail/Breadcrumbs.tsx";
import { StackTrace } from "./detail/StackTrace.tsx";
import { IssueTag } from "./IssueRow.tsx";
import { useIssue, useSetIssueStatus } from "./use-issues.ts";

function Actions({ issueId, status }: { issueId: string; status: string }) {
  const set = useSetIssueStatus(issueId);
  if (status !== "unresolved") {
    return (
      <ActionBar>
        <View className="flex-1">
          <Button label="Reopen" onPress={() => set.mutate("unresolved")} loading={set.isPending} />
        </View>
      </ActionBar>
    );
  }
  return (
    <ActionBar>
      <View className="flex-1">
        <Button label="Resolve" onPress={() => set.mutate("resolved")} loading={set.isPending && set.variables === "resolved"} />
      </View>
      <View className="w-28">
        <Button label="Ignore" variant="secondary" onPress={() => set.mutate("ignored")} loading={set.isPending && set.variables === "ignored"} />
      </View>
    </ActionBar>
  );
}

export function IssueDetailScreen({ issueId }: { issueId: string }) {
  const q = useIssue(issueId);
  const data = q.data;
  return (
    <StackScreen back="Issues" center={data ? `#${data.issue.number}` : undefined} footer={data ? <Actions issueId={issueId} status={data.issue.status} /> : null}>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {data ? (
        <>
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <IssueTag issue={data.issue} />
              <Text className="text-[13px] text-dim">
                {data.issue.kind} · {data.detail.platforms.map((p) => p.name).join(", ") || "—"}
              </Text>
            </View>
            <Text selectable className="font-mono text-[26px] font-semibold tracking-tight text-fg">
              {data.issue.type}
            </Text>
            <Text selectable className="text-base leading-[23px] text-[#c8c8c8]">
              {data.issue.message}
            </Text>
            {data.issue.culprit ? <Text className="font-mono text-xs text-muted">{/^at /.test(data.issue.culprit) ? data.issue.culprit : `at ${data.issue.culprit}`}</Text> : null}
          </View>
          <StatRow
            stats={[
              { label: "events", value: formatNumber(data.detail.events) },
              { label: "players", value: formatNumber(data.detail.players) },
              { label: "last seen", value: formatAgo(data.issue.lastSeenAt).replace(" ago", "") },
            ]}
          />
          {data.detail.latest ? (
            <>
              <StackTrace stack={data.detail.latest.stack} type={data.issue.type} />
              <Breadcrumbs crumbs={data.detail.latest.breadcrumbs} crashAt={data.detail.latest.occurredAt} type={data.issue.type} />
            </>
          ) : null}
        </>
      ) : null}
    </StackScreen>
  );
}
