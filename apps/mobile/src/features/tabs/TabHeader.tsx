import { Header } from "../../components/layout/Header.tsx";
import { useMe } from "../session/index.ts";
import { useWorkspace } from "../workspace/index.ts";

/** The header every tab shares, wired to the current game and user. */
export function TabHeader() {
  const { game, environment } = useWorkspace();
  const me = useMe();
  return <Header game={game?.name ?? null} environment={environment?.name ?? null} initial={(me.data?.email[0] ?? "?").toUpperCase()} />;
}
