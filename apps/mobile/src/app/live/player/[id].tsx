import { useLocalSearchParams } from "expo-router";
import { PlayerScreen } from "../../../features/players/index.ts";

export default function PlayerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayerScreen playerId={id} />;
}
