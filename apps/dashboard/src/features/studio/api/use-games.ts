import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

export const gamesKey = (orgId: string) => ["games", orgId] as const;

/** Games in an org, with environments and their active keys. */
export function useGames(orgId: string) {
  return useQuery({
    queryKey: gamesKey(orgId),
    queryFn: async () => {
      const res = await adminApi.orgs[":orgId"].games.$get({ param: { orgId } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).games;
    },
  });
}

export type Game = NonNullable<ReturnType<typeof useGames>["data"]>[number];
export type Environment = Game["environments"][number];
