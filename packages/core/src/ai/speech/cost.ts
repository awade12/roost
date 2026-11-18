/**
 * What a speech call really cost. OpenRouter's speech endpoint answers with raw audio and no
 * price, but it names the generation (`x-generation-id`), and its generation endpoint reports
 * `total_cost` once the bill is settled, usually within a few seconds. Tries a few times, then
 * gives up (undefined).
 */
export async function speechCost(opts: {
  apiKey: string;
  generationId: string;
  fetch?: typeof fetch;
  /** Waits before each try, in ms. */
  waits?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}): Promise<number | undefined> {
  const waits = opts.waits ?? [1500, 3000, 6000];
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const url = `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(opts.generationId)}`;
  for (const wait of waits) {
    await sleep(wait);
    try {
      const res = await (opts.fetch ?? fetch)(url, { headers: { authorization: `Bearer ${opts.apiKey}` }, signal: AbortSignal.timeout(10_000) });
      // 404 while the generation isn't recorded yet: try again.
      if (!res.ok) continue;
      const body = (await res.json()) as { data?: { total_cost?: unknown } };
      const cost = Number(body.data?.total_cost);
      if (Number.isFinite(cost) && cost >= 0) return cost;
    } catch {
      // Offline or slow: try again.
    }
  }
  return undefined;
}
