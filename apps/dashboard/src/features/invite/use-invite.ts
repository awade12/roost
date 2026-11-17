import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";
import { ME_KEY } from "../session/index.ts";

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ["invite", token],
    retry: false,
    queryFn: async () => {
      const res = await adminApi.invites[":token"].$get({ param: { token } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await adminApi.invites[":token"].accept.$post({ param: { token } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    // The new studio shows up through /me.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}
