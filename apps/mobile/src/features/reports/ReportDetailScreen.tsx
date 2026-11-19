import { router } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { ErrorState, Loading } from "../../components/data/States.tsx";
import { ActionBar } from "../../components/layout/ActionBar.tsx";
import { StackScreen } from "../../components/layout/StackScreen.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { attachmentSource } from "../../lib/api.ts";
import { formatAgo } from "../../lib/format.ts";
import { useReport, useSetReportStatus } from "./use-reports.ts";

const kb = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="gap-px">
      <Text className="text-xs text-dim">{label}</Text>
      <Text className={`text-sm text-fg ${mono ? "font-mono" : ""}`}>{value}</Text>
    </View>
  );
}

export function ReportDetailScreen({ reportId }: { reportId: string }) {
  const q = useReport(reportId);
  const set = useSetReportStatus(reportId);
  const data = q.data;
  const shot = data?.attachments.find((a) => a.contentType.startsWith("image/"));
  const footer = data ? (
    <ActionBar>
      <View className="flex-1">
        {data.report.status === "open" ? <Button label="Close report" onPress={() => set.mutate("closed")} loading={set.isPending} /> : <Button label="Reopen" variant="secondary" onPress={() => set.mutate("open")} loading={set.isPending} />}
      </View>
    </ActionBar>
  ) : null;
  return (
    <StackScreen back="Reports" center="Report" footer={footer}>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {data ? (
        <>
          <View className="flex-row gap-3">
            {shot ? <Image source={attachmentSource(shot.id)} accessibilityLabel="Screenshot the player attached" resizeMode="cover" className="h-[214px] w-[150px] rounded-[14px] border border-border bg-panel" /> : null}
            <View className="flex-1 gap-2.5 py-0.5">
              <Fact label="Build" value={data.report.build} mono />
              <Fact label="Device" value={[data.report.deviceModel, data.report.osVersion].filter(Boolean).join(" · ") || data.report.platform} />
              <Fact label="Player" value={data.report.playerId} mono />
              <Fact label="Sent" value={formatAgo(data.report.receivedAt)} />
            </View>
          </View>
          <View className="gap-2.5">
            <Text className="text-[13px] font-medium text-dim">The player wrote · {data.report.category}</Text>
            <Text selectable className="text-[22px] font-medium leading-[29px] tracking-tight text-fg">
              “{data.report.message}”
            </Text>
          </View>
          {data.attachments.length ? (
            <View className="border-t border-border">
              {data.attachments.map((a) => (
                <View key={a.id} className="flex-row items-center gap-3 border-b border-border py-3">
                  <Text className="w-10 font-mono text-[11px] text-muted">{(a.contentType.split("/")[1] ?? "file").slice(0, 4).toUpperCase()}</Text>
                  <Text numberOfLines={1} className="flex-1 font-mono text-sm text-fg">
                    {a.name}
                  </Text>
                  <Text className="text-[13px] text-dim">{kb(a.size)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {data.report.issueId ? (
            <Pressable onPress={() => router.push(`/issue/${data.report.issueId}`)} className="flex-row items-center gap-2.5 rounded-xl border border-border bg-panel px-3.5 py-3 active:opacity-80">
              <View className="h-2 w-2 rounded-full bg-warn" />
              <View className="flex-1 gap-px">
                <Text className="text-sm font-medium text-fg">Linked to issue #{data.report.issueNumber}</Text>
                <Text className="text-xs text-muted">Open the crash</Text>
              </View>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </StackScreen>
  );
}
