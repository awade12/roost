import { ALL_FEATURES } from "@roost/setup";
import { useState } from "react";
import { Dialog } from "../../components/ui/index.ts";
import { useCreateKey, type Game } from "../studio/index.ts";
import { SetupOptions } from "./components/SetupOptions.tsx";
import { SetupPreview } from "./components/SetupPreview.tsx";
import { useSetupFiles, type SetupChoice } from "./use-setup-files.ts";

/**
 * "Set up in your game": pick the platform and features, get ROOST.md (instructions a coding
 * agent can follow) and a starter roost.config.json to copy or download.
 */
export function SetupDialog({ orgId, game, onClose }: { orgId: string; game: Game; onClose: () => void }) {
  const prod = game.environments.find((e) => e.name === "production") ?? game.environments[0];
  const [choice, setChoice] = useState<SetupChoice>({ envId: prod?.id ?? "", platform: "expo", features: ALL_FEATURES, clientKey: null });
  const createKey = useCreateKey(orgId);
  const files = useSetupFiles(game, choice);
  const makeKey = () => createKey.mutate({ environmentId: choice.envId, kind: "client" }, { onSuccess: (key) => setChoice((c) => ({ ...c, clientKey: key.raw })) });

  return (
    <Dialog open onClose={onClose} size="lg" title={`Set up ${game.name} in your game`} description="Hand these to your coding agent, or follow them yourself. Nothing here is saved.">
      <div className="flex flex-col gap-5 pb-5">
        <SetupOptions game={game} choice={choice} onChange={setChoice} onCreateKey={makeKey} creatingKey={createKey.isPending} />
        {createKey.error && <p className="text-xs text-danger">{createKey.error.message}</p>}
        <SetupPreview files={files} />
      </div>
    </Dialog>
  );
}
