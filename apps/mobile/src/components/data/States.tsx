import { ActivityIndicator, Text, View } from "react-native";
import { errorMessage } from "../../lib/api-error.ts";
import { Button } from "../ui/Button.tsx";

export function Loading() {
  return (
    <View className="items-center py-16">
      <ActivityIndicator color="#8f8f8f" />
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View className="items-center gap-1 rounded-2xl border border-border bg-panel px-6 py-10">
      <Text className="text-[15px] font-semibold text-fg">{title}</Text>
      {body ? <Text className="text-center text-sm text-muted">{body}</Text> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View className="gap-4 rounded-2xl border border-border bg-panel px-6 py-8">
      <View className="gap-1">
        <Text className="text-[15px] font-semibold text-danger">Couldn't load this</Text>
        <Text className="text-sm text-muted">{errorMessage(error)}</Text>
      </View>
      <Button label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}
