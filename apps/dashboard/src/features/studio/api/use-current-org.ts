import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";
import { useMe } from "../../session/index.ts";

/** The org the dashboard is showing. Multi-org switching comes later; for now it's the first one. */
export function useCurrentOrg() {
  return useMe().data?.orgs[0] ?? null;
}

/** People in the current org, for assignee pickers. */
export function useMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ["members", orgId],
    enabled: Boolean(orgId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await adminApi.orgs[":orgId"].members.$get({ param: { orgId: orgId ?? "" } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).members;
    },
  });
}
