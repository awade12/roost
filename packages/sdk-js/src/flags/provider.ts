import type { FlagStore } from "./store.ts";

/**
 * An OpenFeature provider backed by Roost, without depending on the OpenFeature package:
 *
 *   import { OpenFeature } from "@openfeature/web-sdk";
 *   await OpenFeature.setProviderAndWait(roost.openFeatureProvider());
 *   OpenFeature.getClient().getBooleanValue("new_shop", false);
 *
 * Targeting happens on the server for this SDK's player, so the evaluation context is ignored.
 */
export function createProvider(store: FlagStore) {
  return {
    metadata: { name: "roost" },
    runsOn: "client" as const,
    hooks: [],
    initialize: async () => {
      await store.refresh();
    },
    resolveBooleanEvaluation: (key: string, fallback: boolean) => store.details(key, fallback, "boolean"),
    resolveStringEvaluation: (key: string, fallback: string) => store.details(key, fallback, "string"),
    resolveNumberEvaluation: (key: string, fallback: number) => store.details(key, fallback, "number"),
    resolveObjectEvaluation: <T>(key: string, fallback: T) => store.details(key, fallback, "json"),
  };
}
