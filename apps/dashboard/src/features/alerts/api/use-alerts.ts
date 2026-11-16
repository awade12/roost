import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

const alertsKey = (gameId: string) => ["alerts", gameId] as const;

/** A game's alert rules and the latest alerts sent. */
export function useAlerts(gameId: string) {
  return useQuery({
    queryKey: alertsKey(gameId),
    enabled: Boolean(gameId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await adminApi.games[":gameId"].alerts.$get({ param: { gameId } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export type AlertsData = NonNullable<ReturnType<typeof useAlerts>["data"]>;
export type AlertRule = AlertsData["rules"][number];
export type AlertFiring = AlertsData["history"][number];
export type Trigger = AlertRule["trigger"];
export type IssueKind = AlertRule["kinds"][number];

export type RuleForm = {
  name: string;
  environmentId: string;
  trigger: Trigger;
  kinds: IssueKind[];
  threshold: number;
  windowMinutes: number;
  cooldownMinutes: number;
  channelIds: string[];
  enabled: boolean;
};

/** Creates a rule, or saves an edit when `id` is given. */
export function useSaveRule(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id: string | null; form: RuleForm }) => {
      const res = id
        ? await adminApi.alerts[":ruleId"].$put({ param: { ruleId: id }, json: form })
        : await adminApi.games[":gameId"].alerts.$post({ param: { gameId }, json: form });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertsKey(gameId) }),
  });
}

export function useDeleteRule(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await adminApi.alerts[":ruleId"].$delete({ param: { ruleId } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertsKey(gameId) }),
  });
}
