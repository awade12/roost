import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

/** The newest occurrences of an issue (25). */
export function useIssueEvents(issueId: string) {
  return useQuery({
    queryKey: ["issue-events", issueId],
    queryFn: async () => {
      const res = await adminApi.issues[":issueId"].events.$get({ param: { issueId }, query: {} });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).events;
    },
  });
}

/** Everything the SDK sent for one occurrence, plus its attachments. */
export function useIssueEvent(issueId: string, eventId: string | null) {
  return useQuery({
    queryKey: ["issue-event", issueId, eventId],
    enabled: eventId !== null,
    queryFn: async () => {
      const res = await adminApi.issues[":issueId"].events[":eventId"].$get({ param: { issueId, eventId: eventId ?? "" } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export type IssueEventSummary = NonNullable<ReturnType<typeof useIssueEvents>["data"]>[number];
export type IssueEvent = NonNullable<ReturnType<typeof useIssueEvent>["data"]>;
