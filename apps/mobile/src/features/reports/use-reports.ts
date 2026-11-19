import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

export type ReportStatus = "open" | "closed";

export function useReports(environmentId: string | null, status: ReportStatus) {
  return useQuery({
    queryKey: ["reports", environmentId, status],
    enabled: environmentId !== null,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].reports.$get({ param: { environmentId: environmentId ?? "" }, query: { status } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).reports;
    },
  });
}

export type ReportListItem = NonNullable<ReturnType<typeof useReports>["data"]>[number];

export function useReport(reportId: string) {
  return useQuery({
    queryKey: ["report", reportId],
    queryFn: async () => {
      const res = await adminApi.reports[":reportId"].$get({ param: { reportId } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export function useSetReportStatus(reportId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: ReportStatus) => {
      const res = await adminApi.reports[":reportId"].$patch({ param: { reportId }, json: { status } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => Promise.all(["report", "reports", "nav-counts"].map((k) => queryClient.invalidateQueries({ queryKey: [k] }))),
  });
}
