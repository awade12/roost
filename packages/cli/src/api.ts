/** Where to send requests: flags win over ROOST_ENDPOINT / ROOST_KEY. */
export type Target = { endpoint: string; key: string };

export async function call<T>(t: Target, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${t.endpoint.replace(/\/$/, "")}/v1${path}`, {
    method,
    headers: { "x-roost-key": t.key, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

/** The API's `{ error: { code, message } }`, as one line. */
export function errorText(data: unknown): string {
  const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
  return err ? `${err.code}: ${err.message}` : "unexpected response";
}
