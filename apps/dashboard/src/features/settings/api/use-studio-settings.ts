import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const invitesKey = (orgId: string) => ["invites", orgId] as const;

/** Pending invites (owners only). */
export function useInvites(orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: invitesKey(orgId),
    enabled,
    queryFn: async () => {
      const res = await adminApi.orgs[":orgId"].invites.$get({ param: { orgId } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).invites;
    },
  });
}

export function useSendInvite(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: Role }) => {
      const res = await adminApi.orgs[":orgId"].invites.$post({ param: { orgId }, json: input });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey(orgId) }),
  });
}

export function useRevokeInvite(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await adminApi.orgs[":orgId"].invites[":inviteId"].$delete({ param: { orgId, inviteId } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey(orgId) }),
  });
}
