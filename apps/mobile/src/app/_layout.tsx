import "../../global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { colors } from "../components/theme.ts";
import { SessionProvider, useSession } from "../features/session/index.ts";
import { WorkspaceProvider } from "../features/workspace/index.ts";
import { queryClient } from "../lib/query-client.ts";

void SplashScreen.preventAutoHideAsync();

// Modals (Account, the game switcher) open over the tabs, even when the app is
// relaunched straight onto one of them.
export const unstable_settings = { anchor: "(tabs)" };

function Navigator() {
  const { status } = useSession();
  // Keep the splash up until we know whether there's a stored session, so sign-in never flashes.
  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);
  if (status === "loading") return null;
  return (
    <WorkspaceProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={status === "signedIn"}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" options={{ presentation: "modal" }} />
          <Stack.Screen name="switch-game" options={{ presentation: "formSheet", sheetAllowedDetents: [0.55, 0.9], sheetGrabberVisible: true, contentStyle: { backgroundColor: "#141414" } }} />
        </Stack.Protected>
        <Stack.Protected guard={status === "signedOut"}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </WorkspaceProvider>
  );
}

// Expo Router requires a default export for routes.
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <StatusBar style="light" />
        <Navigator />
      </SessionProvider>
    </QueryClientProvider>
  );
}
