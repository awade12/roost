import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

/** New and regressed issues and open bug reports, for badges and "Needs attention". */
export function useNavCounts(environmentId: string | null) {
  return useQuery({
    queryKey: ["nav-counts", environmentId],
    enabled: environmentId !== null,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"]["nav-counts"].$get({ param: { environmentId: environmentId ?? "" } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}
