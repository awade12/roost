import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

export const aiKey = (gameId: string) => ["ai", gameId] as const;

/** Templates, limits and usage for one game's AI proxy. */
export function useAi(gameId: string) {
  return useQuery({
    queryKey: aiKey(gameId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await adminApi.games[":gameId"].ai.$get({ param: { gameId } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export type AiData = NonNullable<ReturnType<typeof useAi>["data"]>;
export type AiTemplate = AiData["templates"][number];
export type AiLimits = AiData["limits"];
