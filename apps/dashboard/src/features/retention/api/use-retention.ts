import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

export type RetentionQuery = { days: "30" | "60" | "90"; build: string; platform: string };

export function useRetention(environmentId: string, q: RetentionQuery) {
  return useQuery({
    queryKey: ["retention", environmentId, q],
    enabled: Boolean(environmentId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const query = { days: q.days, ...(q.build ? { build: q.build } : {}), ...(q.platform ? { platform: q.platform } : {}) };
      const res = await adminApi.environments[":environmentId"].retention.$get({ param: { environmentId }, query });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export type RetentionData = NonNullable<ReturnType<typeof useRetention>["data"]>;
