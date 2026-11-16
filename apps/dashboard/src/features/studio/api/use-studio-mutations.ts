import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";
import { ME_KEY } from "../../session/index.ts";
import { gamesKey } from "./use-games.ts";

export function useCreateOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await adminApi.orgs.$post({ json: { name } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useCreateGame(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await adminApi.orgs[":orgId"].games.$post({ param: { orgId }, json: { name } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gamesKey(orgId) }),
  });
}

/** Creates a key. The response holds the raw key, which the API never returns again. */
export function useCreateKey(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { environmentId: string; kind: "client" | "server" }) => {
      const res = await adminApi.environments[":environmentId"].keys.$post({
        param: { environmentId: input.environmentId },
        json: { kind: input.kind },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gamesKey(orgId) }),
  });
}

export function useRevokeKey(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      const res = await adminApi.keys[":keyId"].$delete({ param: { keyId } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gamesKey(orgId) }),
  });
}
