import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";
import { useSession } from "../SessionProvider.tsx";

export const ME_KEY = ["me"] as const;

/** The signed-in user and their studios. A 401 (expired or revoked session) signs the app out. */
export function useMe() {
  const { status, signOut } = useSession();
  const query = useQuery({
    queryKey: ME_KEY,
    enabled: status === "signedIn",
    queryFn: async () => {
      const res = await adminApi.me.$get();
      if (res.status === 401) return null;
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
  const expired = query.data === null;
  useEffect(() => {
    if (expired) void signOut();
  }, [expired, signOut]);
  return query;
}
