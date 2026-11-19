import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../lib/api.ts";
import { apiError } from "../../lib/api-error.ts";

/** The newest events in the last hour, polled every 3 seconds while `live`. */
export function useEventStream(environmentId: string | null, name: string | null, live: boolean) {
  return useQuery({
    queryKey: ["event-stream", environmentId, name],
    enabled: environmentId !== null,
    refetchInterval: live ? 3000 : false,
    queryFn: async () => {
      const res = await adminApi.environments[":environmentId"].events.$get({
        param: { environmentId: environmentId ?? "" },
        query: { range: "1h", ...(name ? { name } : {}) },
      });
      if (!res.ok) throw await apiError(res);
      return (await res.json()).events;
    },
  });
}

/** `{"level":3,"stars":2}` → "level=3 stars=2". */
export function propsLine(json: string, value: number | null): string {
  let parts: string[] = [];
  try {
    const obj = JSON.parse(json) as Record<string, unknown>; // the API sends props as a JSON object string
    parts = Object.entries(obj).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  } catch {
    // Unparseable props: show nothing rather than fail the row.
  }
  if (value !== null && value !== 0) parts.push(`value=${value}`);
  return parts.join(" ");
}
