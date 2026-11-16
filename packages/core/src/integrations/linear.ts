import { z } from "zod";

const ENDPOINT = "https://api.linear.app/graphql";

/** Linear rejected the key or the request. Message is safe to show. */
export class LinearError extends Error {}

async function gql<T>(apiKey: string, query: string, variables: Record<string, unknown>, schema: z.ZodType<T>, fetchImpl = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      // Linear personal API keys go in Authorization as-is (no "Bearer").
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new LinearError("Couldn't reach Linear");
  }
  if (res.status === 401 || res.status === 403) throw new LinearError("Linear rejected the API key");
  const body = (await res.json().catch(() => null)) as { data?: unknown; errors?: { message: string }[] } | null;
  if (!res.ok || body?.errors?.length) throw new LinearError(body?.errors?.[0]?.message ?? `Linear returned HTTP ${res.status}`);
  const parsed = schema.safeParse(body?.data);
  if (!parsed.success) throw new LinearError("Linear returned an unexpected response");
  return parsed.data;
}

const Teams = z.object({ teams: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string(), key: z.string() })) }) });

export async function listTeams(apiKey: string, fetchImpl?: typeof fetch) {
  const data = await gql(apiKey, "query { teams { nodes { id name key } } }", {}, Teams, fetchImpl);
  return data.teams.nodes;
}

const Created = z.object({
  issueCreate: z.object({ success: z.boolean(), issue: z.object({ identifier: z.string(), url: z.string() }) }),
});

export async function createLinearIssue(
  apiKey: string,
  input: { teamId: string; title: string; description: string },
  fetchImpl?: typeof fetch,
) {
  const data = await gql(
    apiKey,
    "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }",
    { input },
    Created,
    fetchImpl,
  );
  return data.issueCreate.issue;
}
