import type { ErrorBody } from "@roost/contracts";

/** Turns a failed API response into an Error carrying the API's own message. */
export async function apiError(res: Response): Promise<Error> {
  try {
    // The API always answers errors with ErrorBody (see CLAUDE.md "API and data").
    const body = (await res.json()) as ErrorBody;
    return new Error(body.error.message);
  } catch {
    return new Error(`Request failed (${res.status})`);
  }
}
