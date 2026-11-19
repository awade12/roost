import Constants from "expo-constants";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button.tsx";
import { config } from "../../lib/config.ts";
import { useMe, useSignOut } from "../session/index.ts";
import { useWorkspace, WorkspacePicker } from "../workspace/index.ts";

/** Opened from the avatar. Who you are, which game you're looking at, and sign out. */
export function AccountScreen() {
  const me = useMe();
  const ws = useWorkspace();
  const signOut = useSignOut();
  const role = me.data?.orgs.find((o) => o.id === ws.org?.id)?.role;
  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-bg">
      <View className="h-14 flex-row items-center justify-between px-5">
        <Text className="text-[17px] font-semibold text-fg">Account</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} className="h-8 justify-center rounded-full border border-border bg-raised px-3.5 active:opacity-80">
          <Text className="text-[15px] font-semibold text-fg">Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="gap-7 px-5 pb-10 pt-4">
        <View className="flex-row items-center gap-3.5">
          <View className="h-[52px] w-[52px] items-center justify-center rounded-full border border-border bg-raised">
            <Text className="text-[19px] font-semibold text-fg">{(me.data?.email[0] ?? "?").toUpperCase()}</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text numberOfLines={1} className="text-xl font-semibold tracking-tight text-fg">
              {me.data?.email ?? " "}
            </Text>
            {ws.org ? <Text className="text-sm text-muted">{ws.org.name}{role ? ` · ${role}` : ""}</Text> : null}
          </View>
        </View>
        <WorkspacePicker />
        <View className="gap-4">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-sm text-muted">Server</Text>
            <Text className="font-mono text-[13px] text-fg">{config.serverUrl.replace(/^https?:\/\//, "")}</Text>
          </View>
          <View className="flex-row items-baseline justify-between">
            <Text className="text-sm text-muted">App</Text>
            <Text className="font-mono text-[13px] text-fg">{Constants.expoConfig?.version ?? "dev"}</Text>
          </View>
          <Button label="Sign out" variant="danger" onPress={() => signOut.mutate()} loading={signOut.isPending} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
