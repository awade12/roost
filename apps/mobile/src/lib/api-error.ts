import type { ErrorBody } from "@roost/contracts";

/** An API failure that keeps the HTTP status, so callers can tell "signed out" from "broken". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Turns a failed API response into an ApiError carrying the API's own message.
 * Takes only what it reads: React Native's and Node's `Response` types differ.
 */
export async function apiError(res: { status: number; json: () => Promise<unknown> }): Promise<ApiError> {
  try {
    // The API always answers errors with ErrorBody (see CLAUDE.md "API and data").
    const body = (await res.json()) as ErrorBody;
    return new ApiError(body.error.message, res.status);
  } catch {
    return new ApiError(`Request failed (${res.status})`, res.status);
  }
}

/** Plain-language message for any thrown value, for error states. */
export function errorMessage(err: unknown): string {
  if (err instanceof TypeError) return "Can't reach the Roost server. Check your connection.";
  return err instanceof Error ? err.message : "Something went wrong";
}
