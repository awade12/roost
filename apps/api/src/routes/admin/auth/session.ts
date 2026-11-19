import { auth } from "@roost/core";
import type { Db } from "@roost/db";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { AppError } from "../../../http/errors.ts";

export const SESSION_COOKIE = "roost_session";

export type SessionVars = { userId: string };

export function setSessionCookie(c: Context, token: string, expires: Date, secure: boolean): void {
  // httpOnly: page scripts can't read it. Lax: not sent on cross-site POSTs.
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "Lax", path: "/", expires });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/**
 * The dashboard sends the session as a cookie; the mobile app, which has no
 * cookie jar it controls, sends it as `Authorization: Bearer <token>`.
 */
export function sessionToken(c: Context): string | undefined {
  const bearer = /^Bearer (\S+)$/.exec(c.req.header("authorization") ?? "")?.[1];
  return bearer ?? getCookie(c, SESSION_COOKIE);
}

/** Rejects the request unless it carries a live session (cookie or bearer); exposes `userId`. */
export function requireSession(db: Db): MiddlewareHandler<{ Variables: SessionVars }> {
  return async (c, next) => {
    const token = sessionToken(c);
    const session = token ? await auth.findSession(db, token) : null;
    if (!session) throw new AppError("unauthorized", "Not signed in");
    c.set("userId", session.userId);
    await next();
  };
}
