import * as SecureStore from "expo-secure-store";
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { useMe } from "../session/index.ts";
import { pickEnvironment, pickOrg, type Saved } from "./pick.ts";
import { useGames } from "./use-games.ts";

const KEY = "roost.workspace";

function useSaved() {
  const [saved, setSaved] = useState<Saved>({ orgId: null, environmentId: null });
  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((raw) => raw && setSaved(JSON.parse(raw) as Saved)) // only this app writes the key
      .catch(() => undefined);
  }, []);
  const save = useCallback((next: Saved) => {
    setSaved(next);
    void SecureStore.setItemAsync(KEY, JSON.stringify(next));
  }, []);
  return [saved, save] as const;
}

function useWorkspaceValue() {
  const me = useMe();
  const [saved, save] = useSaved();
  const orgs = me.data?.orgs ?? [];
  const org = pickOrg(orgs, saved);
  const games = useGames(org?.id ?? null);
  const picked = pickEnvironment(games.data ?? [], saved);
  const select = useCallback((orgId: string, environmentId: string | null) => save({ orgId, environmentId }), [save]);
  return {
    orgs,
    org,
    games: games.data ?? [],
    game: picked?.game ?? null,
    environment: picked?.environment ?? null,
    select,
    isLoading: me.isLoading || games.isLoading,
    error: me.error ?? games.error,
    refetch: () => Promise.all([me.refetch(), games.refetch()]),
  };
}

export type Workspace = ReturnType<typeof useWorkspaceValue>;
const WorkspaceContext = createContext<Workspace | null>(null);

/** Which studio, game and environment the app is showing, remembered between launches. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return <WorkspaceContext value={useWorkspaceValue()}>{children}</WorkspaceContext>;
}

export function useWorkspace(): Workspace {
  const workspace = use(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return workspace;
}
