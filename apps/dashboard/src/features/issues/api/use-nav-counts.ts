import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

/** Sidebar badges: new and regressed issues, open player reports. */
export function useNavCounts(environmentId: string | undefined) {
  return useQuery({
    queryKey: ["nav-counts", environmentId],
    enabled: Boolean(environmentId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"]["nav-counts"].$get({
        param: { environmentId: environmentId ?? "" },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}
