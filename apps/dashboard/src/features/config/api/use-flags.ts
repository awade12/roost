import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

const key = (environmentId: string) => ["flags", environmentId] as const;

export function useFlags(environmentId: string) {
  return useQuery({
    queryKey: key(environmentId),
    enabled: Boolean(environmentId),
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].flags.$get({ param: { environmentId } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).flags;
    },
  });
}

export type Flag = NonNullable<ReturnType<typeof useFlags>["data"]>[number];
export type FlagType = Flag["type"];
export type FlagFields = { description: string; value: unknown; rollout: { percent: number; value: unknown } | null; overrides: Record<string, unknown> };

/** Creates a flag (with key and type), or saves an edit when `id` is given. */
export function useSaveFlag(environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, create, fields }: { id: string | null; create?: { key: string; type: FlagType }; fields: FlagFields }) => {
      const res = id
        ? await adminApi.flags[":flagId"].$put({ param: { flagId: id }, json: fields })
        : await adminApi.environments[":environmentId"].flags.$post({ param: { environmentId }, json: { ...fields, key: create?.key ?? "", type: create?.type ?? "boolean" } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(environmentId) }),
  });
}

export function useDeleteFlag(environmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (flagId: string) => {
      const res = await adminApi.flags[":flagId"].$delete({ param: { flagId } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(environmentId) }),
  });
}
