import { buildSetup, type Features, type Platform } from "@roost/setup";
import { useMemo } from "react";
import { useAi } from "../ai/index.ts";
import { useFlags } from "../config/index.ts";
import type { Environment, Game } from "../studio/index.ts";

export type SetupChoice = { envId: string; platform: Platform; features: Features; clientKey: string | null };

/**
 * The guide and config file for the current choices, built in the browser so the preview
 * updates as you click. The game's real templates and the environment's flags are listed in it.
 */
export function useSetupFiles(game: Game, choice: SetupChoice) {
  const templates = useAi(game.id).data?.templates.map((t) => t.name) ?? [];
  const flags = useFlags(choice.envId).data?.map((f) => ({ key: f.key, type: f.type })) ?? [];
  const env: Environment | undefined = game.environments.find((e) => e.id === choice.envId);
  return useMemo(
    () =>
      buildSetup({
        game: game.name,
        environment: env?.name ?? "",
        // The dashboard and the API share one origin (Caddy in production, Vite's proxy in dev).
        endpoint: window.location.origin,
        clientKey: choice.clientKey,
        platform: choice.platform,
        features: choice.features,
        templates,
        flags,
      }),
    // Stringified lists: new arrays every render would rebuild the guide for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.name, env?.name, choice, JSON.stringify(templates), JSON.stringify(flags)],
  );
}
