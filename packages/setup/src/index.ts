import { buildConfigFile, buildGuide } from "./guide.ts";
import type { SetupFile, SetupInput } from "./types.ts";

export { buildConfigFile, buildGuide } from "./guide.ts";
export { ALL_FEATURES, type Features, type Platform, type SetupFile, type SetupInput } from "./types.ts";

/** Everything a game repo needs to start: agent instructions and a config-as-code starter. */
export function buildSetup(input: SetupInput): SetupFile[] {
  return [
    { name: "ROOST.md", content: buildGuide(input) },
    { name: "roost.config.json", content: buildConfigFile(input) },
  ];
}
