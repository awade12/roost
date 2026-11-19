import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

export function usePlayers(environmentId: string | null, q: string) {
  return useQuery({
    queryKey: ["players", environmentId, q],
    enabled: environmentId !== null,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].players.$get({ param: { environmentId: environmentId ?? "" }, query: q ? { q } : {} });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).players;
    },
  });
}

export function usePlayer(environmentId: string | null, playerId: string) {
  return useQuery({
    queryKey: ["player", environmentId, playerId],
    enabled: environmentId !== null,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].players[":playerId"].$get({ param: { environmentId: environmentId ?? "", playerId } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}
