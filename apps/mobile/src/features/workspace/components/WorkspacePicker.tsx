import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";
import { Card } from "../../../components/data/Card.tsx";
import { useWorkspace } from "../WorkspaceProvider.tsx";

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      className={`rounded-lg border px-3 py-2 active:opacity-80 ${selected ? "border-fg bg-hover" : "border-border"}`}
    >
      <Text className={`text-sm ${selected ? "font-semibold text-fg" : "text-muted"}`}>{label}</Text>
    </Pressable>
  );
}

/** Studio, then each game's environments, as tap targets. */
export function WorkspacePicker() {
  const { orgs, org, games, environment, select } = useWorkspace();
  return (
    <View className="gap-4">
      {orgs.length > 1 ? (
        <Card title="Studio">
          <View className="flex-row flex-wrap gap-2">
            {orgs.map((o) => (
              <Option key={o.id} label={o.name} selected={o.id === org?.id} onPress={() => select(o.id, null)} />
            ))}
          </View>
        </Card>
      ) : null}
      {games.map((game) => (
        <Card key={game.id} title={game.name}>
          <View className="flex-row flex-wrap gap-2">
            {game.environments.map((env) => (
              <Option key={env.id} label={env.name} selected={env.id === environment?.id} onPress={() => org && select(org.id, env.id)} />
            ))}
          </View>
        </Card>
      ))}
    </View>
  );
}
