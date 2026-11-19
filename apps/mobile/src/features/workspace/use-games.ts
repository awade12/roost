import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

/** Games in a studio, each with its environments. */
export function useGames(orgId: string | null) {
  return useQuery({
    queryKey: ["games", orgId],
    enabled: orgId !== null,
    queryFn: async () => {
      const res = await adminApi.orgs[":orgId"].games.$get({ param: { orgId: orgId ?? "" } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).games;
    },
  });
}
