import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api.ts";
import { apiError } from "../../../lib/api-error.ts";

export type Range = "1h" | "24h" | "7d" | "30d";

/** The Events page filters. Empty strings mean "any". */
export type EventQuery = {
  range: Range;
  name: string;
  player: string;
  build: string;
  platform: string;
  propKey: string;
  propValue: string;
};

export const EMPTY_QUERY: EventQuery = {
  range: "24h",
  name: "",
  player: "",
  build: "",
  platform: "",
  propKey: "",
  propValue: "",
};

/** Only the filters that are set, as the API's query string. */
function toQuery(q: EventQuery) {
  const set = (v: string) => (v.trim() ? v.trim() : undefined);
  const prop = set(q.propKey) ? { propKey: set(q.propKey), propValue: q.propValue } : {};
  return {
    range: q.range,
    name: set(q.name),
    player: set(q.player),
    build: set(q.build),
    platform: set(q.platform),
    ...prop,
  };
}

type Cursor = { at: string; id: string } | null;

/** Newest-first stream, 100 at a time; "Load more" fetches the next page. */
export function useEventStream(environmentId: string, q: EventQuery) {
  return useInfiniteQuery({
    queryKey: ["events", environmentId, q],
    enabled: Boolean(environmentId),
    initialPageParam: null as Cursor,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }) => {
      const query = {
        ...toQuery(q),
        ...(pageParam ? { before: pageParam.at, beforeId: pageParam.id } : {}),
      };
      const res = await adminApi.environments[":environmentId"].events.$get({
        param: { environmentId },
        query,
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    getNextPageParam: (last) => last.next,
  });
}

export type EventItem = NonNullable<
  ReturnType<typeof useEventStream>["data"]
>["pages"][number]["events"][number];

export function useEventSeries(environmentId: string, q: EventQuery) {
  return useQuery({
    queryKey: ["event-series", environmentId, q],
    enabled: Boolean(environmentId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].events.series.$get({
        param: { environmentId },
        query: toQuery(q),
      });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).series;
    },
  });
}

/** Event names, builds and platforms in the range, for the filter menus. */
export function useEventFacets(environmentId: string, range: Range) {
  return useQuery({
    queryKey: ["event-facets", environmentId, range],
    enabled: Boolean(environmentId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].events.facets.$get({
        param: { environmentId },
        query: { range },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
}

export type Facets = NonNullable<ReturnType<typeof useEventFacets>["data"]>;
