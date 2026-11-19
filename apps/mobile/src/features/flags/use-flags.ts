import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

export function useFlags(environmentId: string | null) {
  return useQuery({
    queryKey: ["flags", environmentId],
    enabled: environmentId !== null,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].flags.$get({ param: { environmentId: environmentId ?? "" } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).flags;
    },
  });
}

export type Flag = NonNullable<ReturnType<typeof useFlags>["data"]>[number];

/** Turns a boolean flag's default on or off, keeping its rollout and overrides as they are. */
export function useToggleFlag(environmentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (flag: Flag) => {
      const res = await adminApi.flags[":flagId"].$put({
        param: { flagId: flag.id },
        json: { description: flag.description, value: flag.value !== true, rollout: flag.rollout, overrides: flag.overrides },
      });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flags", environmentId] }),
  });
}
