import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

const key = (orgId: string) => ["integrations", orgId] as const;

export function useIntegrations(orgId: string) {
  return useQuery({
    queryKey: key(orgId),
    queryFn: async () => {
      const res = await adminApi.orgs[":orgId"].integrations.$get({ param: { orgId } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export function useLinearSetup(orgId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(orgId) });
  const linear = adminApi.orgs[":orgId"].integrations.linear;
  return {
    findTeams: useMutation({
      mutationFn: async (apiKey: string) => {
        const res = await linear.teams.$post({ param: { orgId }, json: { apiKey } });
        if (!res.ok) throw await apiError(res);
        return (await res.json()).teams;
      },
    }),
    connect: useMutation({
      mutationFn: async (input: { apiKey: string; teamId: string }) => {
        const res = await linear.$put({ param: { orgId }, json: input });
        if (!res.ok) throw await apiError(res);
      },
      onSuccess: refresh,
    }),
    disconnect: useMutation({
      mutationFn: async () => {
        const res = await linear.$delete({ param: { orgId } });
        if (!res.ok) throw await apiError(res);
      },
      onSuccess: refresh,
    }),
  };
}
