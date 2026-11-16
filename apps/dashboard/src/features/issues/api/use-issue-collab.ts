import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

async function ok(res: Response) {
  if (!res.ok) throw await apiError(res);
}

/** After any change: refresh the issue, its timeline and the lists. */
function useRefresh(issueId: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [["issue", issueId], ["activity", issueId], ["issues"]]) void queryClient.invalidateQueries({ queryKey: key });
  };
}

export function useActivity(issueId: string) {
  return useQuery({
    queryKey: ["activity", issueId],
    queryFn: async () => {
      const res = await adminApi.issues[":issueId"].activity.$get({ param: { issueId } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).activity;
    },
  });
}

export function useComment(issueId: string) {
  const refresh = useRefresh(issueId);
  return {
    add: useMutation({ mutationFn: async (body: string) => ok(await adminApi.issues[":issueId"].comments.$post({ param: { issueId }, json: { body } })), onSuccess: refresh }),
    remove: useMutation({ mutationFn: async (commentId: string) => ok(await adminApi.issues[":issueId"].comments[":commentId"].$delete({ param: { issueId, commentId } })), onSuccess: refresh }),
  };
}

export function useAssign(issueId: string) {
  const refresh = useRefresh(issueId);
  return useMutation({ mutationFn: async (userId: string | null) => ok(await adminApi.issues[":issueId"].assignee.$put({ param: { issueId }, json: { userId } })), onSuccess: refresh });
}

export function useSendToLinear(issueId: string) {
  const refresh = useRefresh(issueId);
  return useMutation({ mutationFn: async () => ok(await adminApi.issues[":issueId"].linear.$post({ param: { issueId } })), onSuccess: refresh });
}

export function useGameLabels(gameId: string) {
  return useQuery({
    queryKey: ["labels", gameId],
    queryFn: async () => {
      const res = await adminApi.games[":gameId"].labels.$get({ param: { gameId } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).labels;
    },
  });
}

export function useLabelMutations(gameId: string, issueId: string) {
  const queryClient = useQueryClient();
  const refresh = useRefresh(issueId);
  return {
    toggle: useMutation({
      mutationFn: async ({ labelId, on }: { labelId: string; on: boolean }) => ok(await adminApi.issues[":issueId"].labels[":labelId"].$put({ param: { issueId, labelId }, json: { on } })),
      onSuccess: refresh,
    }),
    create: useMutation({
      mutationFn: async (input: { name: string; color: LabelColor }) => {
        const res = await adminApi.games[":gameId"].labels.$post({ param: { gameId }, json: input });
        if (!res.ok) throw await apiError(res);
        return res.json();
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["labels", gameId] }),
    }),
  };
}

export const LABEL_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];
export type Activity = NonNullable<ReturnType<typeof useActivity>["data"]>[number];
