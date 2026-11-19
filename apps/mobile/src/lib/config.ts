import { z } from "zod";

const Env = z.object({
  EXPO_PUBLIC_ROOST_URL: z.url().default("https://roost.playchrona.app"),
});

/** Reads the app's build-time env. Throws on a bad value so a broken build fails on launch, not mid-request. */
export function parseConfig(env: Record<string, string | undefined>) {
  const parsed = Env.parse(env);
  return { serverUrl: parsed.EXPO_PUBLIC_ROOST_URL.replace(/\/+$/, "") };
}

// Expo inlines EXPO_PUBLIC_* only when written out in full like this, so no spreading process.env.
export const config = parseConfig({ EXPO_PUBLIC_ROOST_URL: process.env.EXPO_PUBLIC_ROOST_URL });
