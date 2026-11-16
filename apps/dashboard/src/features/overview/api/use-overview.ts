import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

export type Range = 7 | 30 | 90;

/** Overview analytics for one environment. Refreshes every minute while open. */
export function useOverview(environmentId: string | null, days: Range) {
  return useQuery({
    queryKey: ["overview", environmentId, days],
    enabled: environmentId !== null,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].overview.$get({
        param: { environmentId: environmentId ?? "" },
        query: { days: String(days) as "7" | "30" | "90" },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export type OverviewData = NonNullable<ReturnType<typeof useOverview>["data"]>;
