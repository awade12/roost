import { Tabs } from "expo-router";
import { colors } from "../../components/theme.ts";
import { TabBar } from "../../features/tabs/index.ts";

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="issues" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="live" />
    </Tabs>
  );
}
