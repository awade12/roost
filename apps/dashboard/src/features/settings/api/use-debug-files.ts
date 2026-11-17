import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

const key = (gameId: string) => ["debug-files", gameId] as const;

/** Symbol files and source maps uploaded for a game. */
export function useDebugFiles(gameId: string) {
  return useQuery({
    queryKey: key(gameId),
    queryFn: async () => {
      const res = await adminApi.games[":gameId"]["debug-files"].$get({ param: { gameId } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).files;
    },
  });
}

export type DebugFile = NonNullable<ReturnType<typeof useDebugFiles>["data"]>[number];

export function useDeleteDebugFile(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await adminApi.games[":gameId"]["debug-files"][":fileId"].$delete({ param: { gameId, fileId } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(gameId) }),
  });
}
