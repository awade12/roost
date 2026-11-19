import { useLocalSearchParams } from "expo-router";
import { IssueDetailScreen } from "../../features/issues/index.ts";

export default function IssueRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <IssueDetailScreen issueId={id} />;
}
