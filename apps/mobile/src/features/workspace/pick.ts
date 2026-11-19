/** What the app remembers between launches. */
export type Saved = { orgId: string | null; environmentId: string | null };

type Org = { id: string; name: string };
type Env = { id: string; name: string };
type Game = { id: string; name: string; environments: Env[] };

/** The remembered studio if the user still belongs to it, else their first one. */
export function pickOrg<O extends Org>(orgs: O[], saved: Saved): O | null {
  return orgs.find((o) => o.id === saved.orgId) ?? orgs[0] ?? null;
}

/**
 * The remembered environment if it still exists; otherwise the first game's
 * production environment, since that's what people usually open the app to check.
 */
export function pickEnvironment<G extends Game>(games: G[], saved: Saved): { game: G; environment: G["environments"][number] } | null {
  for (const game of games) {
    const environment = game.environments.find((e) => e.id === saved.environmentId);
    if (environment) return { game, environment };
  }
  const game = games.find((g) => g.environments.length > 0);
  if (!game) return null;
  const environment = game.environments.find((e) => e.name.toLowerCase() === "production") ?? game.environments[0];
  return environment ? { game, environment } : null;
}
