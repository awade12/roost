import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

/** Players seen in the last 30 days, most recent first, optionally matching part of an id. */
export function usePlayers(environmentId: string, q: string) {
  return useQuery({
    queryKey: ["players", environmentId, q],
    enabled: Boolean(environmentId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].players.$get({ param: { environmentId }, query: q ? { q } : {} });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).players;
    },
  });
}

export function usePlayer(environmentId: string, playerId: string) {
  return useQuery({
    queryKey: ["player", environmentId, playerId],
    enabled: Boolean(environmentId),
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].players[":playerId"].$get({ param: { environmentId, playerId } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export type PlayerData = NonNullable<ReturnType<typeof usePlayer>["data"]>;
