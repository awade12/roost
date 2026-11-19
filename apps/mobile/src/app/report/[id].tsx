import { useLocalSearchParams } from "expo-router";
import { ReportDetailScreen } from "../../features/reports/index.ts";

export default function ReportRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReportDetailScreen reportId={id} />;
}
