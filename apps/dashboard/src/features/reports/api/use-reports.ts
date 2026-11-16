import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

export type ReportStatus = "open" | "closed";

export function useReports(environmentId: string, status: ReportStatus) {
  return useQuery({
    queryKey: ["reports", environmentId, status],
    enabled: Boolean(environmentId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].reports.$get({
        param: { environmentId },
        query: { status },
      });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).reports;
    },
  });
}

export type ReportSummary = NonNullable<ReturnType<typeof useReports>["data"]>[number];

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

export type ReportDetail = NonNullable<ReturnType<typeof useReport>["data"]>;

export function useSetReportStatus(reportId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: ReportStatus) => {
      const res = await adminApi.reports[":reportId"].$patch({
        param: { reportId },
        json: { status },
      });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["report", reportId] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]),
  });
}

/**
 * An image attachment as a blob: URL for <img>. Attachments are always served as
 * downloads; reading the bytes here and rendering them only as an image means
 * nothing a player sent can run as a page.
 */
export function useImageAttachment(attachmentId: string, contentType: string) {
  const blob = useQuery({
    queryKey: ["attachment-image", attachmentId],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await adminApi.attachments[":attachmentId"].$get({ param: { attachmentId } });
      if (!res.ok) throw await apiError(res);
      return new Blob([await res.arrayBuffer()], { type: contentType });
    },
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const objectUrl = URL.createObjectURL(blob.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob.data]);
  return { url, isError: blob.isError };
}
