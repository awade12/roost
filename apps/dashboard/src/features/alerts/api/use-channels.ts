import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

const channelsKey = (orgId: string) => ["alert-channels", orgId] as const;

/** The studio's alert channels. URLs never come back from the API, only a hint. */
export function useChannels(orgId: string) {
  return useQuery({
    queryKey: channelsKey(orgId),
    queryFn: async () => {
      const res = await adminApi.orgs[":orgId"]["alert-channels"].$get({ param: { orgId } });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).channels;
    },
  });
}

export type AlertChannel = NonNullable<ReturnType<typeof useChannels>["data"]>[number];
export type ChannelKind = AlertChannel["kind"];
export type NewChannel =
  | { kind: "discord" | "slack" | "webhook"; name: string; url: string }
  | { kind: "email"; name: string; recipients: "everyone" | "owners" };

export function useCreateChannel(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channel: NewChannel) => {
      const res = await adminApi.orgs[":orgId"]["alert-channels"].$post({ param: { orgId }, json: channel });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKey(orgId) }),
  });
}

export function useDeleteChannel(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await adminApi.orgs[":orgId"]["alert-channels"][":channelId"].$delete({ param: { orgId, channelId } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKey(orgId) }),
  });
}

/** Sends a test message; the error says what the channel answered. */
export function useTestChannel(orgId: string) {
  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await adminApi.orgs[":orgId"]["alert-channels"][":channelId"].test.$post({ param: { orgId, channelId } });
      if (!res.ok) throw await apiError(res);
    },
  });
}
