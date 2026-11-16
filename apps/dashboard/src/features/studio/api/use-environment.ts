import { useCurrentOrg } from "./use-current-org.ts";
import { useGames } from "./use-games.ts";
import { useStoredEnvironmentId } from "./selected-environment.ts";

/**
 * The selected game + environment. Falls back to the first game's production
 * environment when nothing (or something stale) is stored.
 */
export function useEnvironment() {
  const org = useCurrentOrg();
  const games = useGames(org?.id ?? "");
  const storedId = useStoredEnvironmentId();
  const all = (games.data ?? []).flatMap((game) => game.environments.map((env) => ({ game, env })));
  const selected =
    all.find(({ env }) => env.id === storedId) ??
    all.find(({ env }) => env.name === "production") ??
    all[0] ??
    null;
  return { games, selected };
}
