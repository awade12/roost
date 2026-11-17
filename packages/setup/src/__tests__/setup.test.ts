import { EventBatchSchema } from "@roost/contracts";
import { describe, expect, it } from "vitest";
import { ALL_FEATURES, buildSetup, type SetupInput } from "../index.ts";

const base: SetupInput = {
  game: "Sky Forge",
  environment: "production",
  endpoint: "https://roost.example.com",
  clientKey: null,
  platform: "expo",
  features: ALL_FEATURES,
  templates: ["coach_chat"],
  flags: [{ key: "boss.hp", type: "number" }],
};

const guide = (patch: Partial<SetupInput>) => buildSetup({ ...base, ...patch })[0]?.content ?? "";

describe("setup files", () => {
  it("writes agent instructions with the game's values and real templates and flags", () => {
    const md = guide({});
    expect(md).toContain("# Roost setup: Sky Forge (production)");
    expect(md).toContain("`https://roost.example.com`");
    expect(md).toContain("process.env.EXPO_PUBLIC_ROOST_KEY");
    expect(md).toContain("`coach_chat`");
    expect(md).toContain("`boss.hp` (number)");
    expect(md).toContain("Never** put a server key");
    expect(md).toContain('npm install "https://roost.example.com/sdk/js/latest.tgz?key=$EXPO_PUBLIC_ROOST_KEY"');
  });

  it("puts a given client key in the code and leaves out unused features", () => {
    const md = guide({ clientKey: "rk_client_abc", features: { ...ALL_FEATURES, ai: false, reports: false } });
    expect(md).toContain('clientKey: "rk_client_abc"');
    expect(md).toContain("latest.tgz?key=rk_client_abc");
    expect(md).not.toContain("## AI");
    expect(md).not.toContain("## Player bug reports");
  });

  it("writes Rust setup with the crash monitor only when native crashes are on", () => {
    expect(guide({ platform: "rust" })).toContain("run_monitor_if_requested");
    expect(guide({ platform: "rust" })).toContain('registry = "roost", features = ["native-crashes"]');
    expect(guide({ platform: "rust" })).toContain('index = "sparse+https://roost.example.com/sdk/cargo/"');
    expect(guide({ platform: "rust" })).toContain("cargo login --registry roost $ROOST_KEY");
    expect(guide({ platform: "rust", features: { ...ALL_FEATURES, nativeCrashes: false } })).not.toContain("run_monitor_if_requested");
  });

  it("starts roost.config.json with examples for the features in use", () => {
    const config = JSON.parse(buildSetup({ ...base, features: { ...ALL_FEATURES, ai: false } })[1]?.content ?? "{}") as { templates: object; flags: object };
    expect(config.templates).toEqual({});
    expect(Object.keys(config.flags)).toEqual(["new_shop"]);
  });

  // Regression: crypto.randomUUID() doesn't exist on Hermes, so the Expo start code must not use it.
  it("makes the player id with the SDK's uuid(), which works on Hermes", () => {
    const md = guide({ platform: "expo" });
    expect(md).toContain("import { Roost, uuid } from \"@roost/sdk\"");
    expect(md).not.toMatch(/=\s*crypto\.randomUUID\(\)/);
  });

  it("gives a troubleshooting request the events API accepts", () => {
    const line = guide({}).split("\n").find((l) => l.includes("roost_setup_check")) ?? "";
    const json = line
      .slice(line.indexOf("-d '") + 4, line.lastIndexOf("'"))
      .replace(`'"$(date -u +%FT%TZ)"'`, "2026-01-01T00:00:00Z");
    expect(EventBatchSchema.safeParse(JSON.parse(json)).success).toBe(true);
  });
});
