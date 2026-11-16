import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

export type IssueStatus = "unresolved" | "resolved" | "ignored";

export function useIssues(environmentId: string, status: IssueStatus) {
  return useQuery({
    queryKey: ["issues", environmentId, status],
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].issues.$get({ param: { environmentId }, query: { status } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).issues;
    },
  });
}

export function useIssue(issueId: string | null) {
  return useQuery({
    queryKey: ["issue", issueId],
    enabled: issueId !== null,
    queryFn: async () => {
      const res = await adminApi.issues[":issueId"].$get({ param: { issueId: issueId ?? "" } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export function useSetIssueStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, status }: { issueId: string; status: IssueStatus }) => {
      const res = await adminApi.issues[":issueId"].$patch({ param: { issueId }, json: { status } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["issues"] });
      void queryClient.invalidateQueries({ queryKey: ["issue"] });
    },
  });
}

export type IssueRow = NonNullable<ReturnType<typeof useIssues>["data"]>[number];
export type IssueDetailData = NonNullable<ReturnType<typeof useIssue>["data"]>;
