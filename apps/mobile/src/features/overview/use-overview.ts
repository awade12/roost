import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

/**
 * 90 days of overview analytics: the headline numbers are 7-day averages, the chart
 * shows the last 30 days against the 30 before.
 */
export function useOverview(environmentId: string | null) {
  return useQuery({
    queryKey: ["overview", environmentId, 90],
    enabled: environmentId !== null,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].overview.$get({
        param: { environmentId: environmentId ?? "" },
        query: { days: "90" },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}
