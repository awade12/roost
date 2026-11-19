import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

/** Templates, limits and this month's usage for one game. */
export function useAi(gameId: string | null) {
  return useQuery({
    queryKey: ["ai", gameId],
    enabled: gameId !== null,
    queryFn: async () => {
      const res = await adminApi.games[":gameId"].ai.$get({ param: { gameId: gameId ?? "" } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

/** Spend so far this month, projected to the month's end at the same daily rate. */
export function projectMonth(spentUsd: number, now = new Date()): number {
  const day = now.getUTCDate();
  const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return day > 0 ? (spentUsd / day) * days : spentUsd;
}
