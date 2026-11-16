import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";
import { ME_KEY } from "../../session/index.ts";

type Role = "owner" | "dev" | "viewer";

export function useRenameStudio(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await adminApi.orgs[":orgId"].$patch({ param: { orgId }, json: { name } });
      if (!res.ok) throw await apiError(res);
    },
    // The studio name comes from /me.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useSetMemberRole(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const res = await adminApi.orgs[":orgId"].members[":userId"].$patch({ param: { orgId, userId }, json: { role } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members", orgId] }),
  });
}

export function useRemoveMember(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await adminApi.orgs[":orgId"].members[":userId"].$delete({ param: { orgId, userId } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members", orgId] }),
  });
}
