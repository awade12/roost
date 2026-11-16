import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";
import { gamesKey, useCurrentOrg } from "../../studio/index.ts";

const settingsKey = (gameId: string) => ["game-settings", gameId] as const;

/** A game's saved settings, the server's defaults, and its AI limits. */
export function useGameSettings(gameId: string) {
  return useQuery({
    queryKey: settingsKey(gameId),
    queryFn: async () => {
      const res = await adminApi.games[":gameId"].settings.$get({ param: { gameId } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export type GameSettingsData = NonNullable<ReturnType<typeof useGameSettings>["data"]>;
export type GameSettings = GameSettingsData["settings"];

export function useSaveGameSettings(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: GameSettings) => {
      const res = await adminApi.games[":gameId"].settings.$put({ param: { gameId }, json: settings });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKey(gameId) }),
  });
}

/** Renaming and adding environments change the games list everywhere (picker, keys page). */
function useRefreshGames() {
  const queryClient = useQueryClient();
  const org = useCurrentOrg();
  return () => queryClient.invalidateQueries({ queryKey: gamesKey(org?.id ?? "") });
}

export function useRenameGame(gameId: string) {
  const refresh = useRefreshGames();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await adminApi.games[":gameId"].$patch({ param: { gameId }, json: { name } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: refresh,
  });
}

export function useAddEnvironment(gameId: string) {
  const refresh = useRefreshGames();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await adminApi.games[":gameId"].environments.$post({ param: { gameId }, json: { name } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: refresh,
  });
}
