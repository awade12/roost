import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

export const ME_KEY = ["me"] as const;

/** Current dashboard user with their orgs, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const res = await adminApi.me.$get();
      if (res.status === 401) return null;
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}
