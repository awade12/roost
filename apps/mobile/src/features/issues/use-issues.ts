import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

export type IssueStatus = "unresolved" | "resolved" | "ignored";

/** Issues in one environment, most recently seen first. */
export function useIssues(environmentId: string | null, status: IssueStatus) {
  return useQuery({
    queryKey: ["issues", environmentId, status],
    enabled: environmentId !== null,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].issues.$get({ param: { environmentId: environmentId ?? "" }, query: { status } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).issues;
    },
  });
}

export type IssueListItem = NonNullable<ReturnType<typeof useIssues>["data"]>[number];

/** One issue with its totals, latest stack trace and breadcrumbs. */
export function useIssue(issueId: string) {
  return useQuery({
    queryKey: ["issue", issueId],
    queryFn: async () => {
      const res = await adminApi.issues[":issueId"].$get({ param: { issueId } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export function useSetIssueStatus(issueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: IssueStatus) => {
      const res = await adminApi.issues[":issueId"].$patch({ param: { issueId }, json: { status } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () =>
      Promise.all(["issue", "issues", "nav-counts"].map((k) => queryClient.invalidateQueries({ queryKey: [k] }))),
  });
}
