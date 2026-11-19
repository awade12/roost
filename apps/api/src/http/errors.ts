import type { ErrorBody, ErrorCode } from "@roost/contracts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logger } from "./logger.ts";

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
  upstream_error: 502,
};

/** Throw this from any handler; `onError` turns it into the standard error body. */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function errorResponse(c: Context, code: ErrorCode, message: string) {
  const body: ErrorBody = { error: { code, message } };
  return c.json(body, STATUS[code]);
}

const BY_STATUS = new Map(Object.entries(STATUS).map(([code, status]) => [status as number, code as ErrorCode]));

export function onError(err: Error, c: Context) {
  if (err instanceof AppError) return errorResponse(c, err.code, err.message);
  // Hono's own middleware (csrf, body limit…) throws these; keep their status instead of a 500.
  const known = err instanceof HTTPException && err.status < 500 ? BY_STATUS.get(err.status) : undefined;
  if (known) return errorResponse(c, known, err.message || "Request refused");
  logger.error({ err, requestId: c.get("requestId") }, "unhandled error");
  return errorResponse(c, "internal", "Something went wrong");
}
