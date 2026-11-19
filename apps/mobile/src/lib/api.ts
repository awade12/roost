import type { AdminApp } from "@roost/api/admin";
import { hc } from "hono/client";
import { config } from "./config.ts";

let sessionToken: string | null = null;

/** Called by the session feature whenever the stored token changes. */
export function setApiToken(token: string | null): void {
  sessionToken = token;
}

/** `Authorization` header for the current session, or none when signed out. */
export function authHeaders(token: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Typed client for /admin, the same API the dashboard uses. A changed route breaks
 * this build, not the app. The app has no cookie jar of its own, so it sends a bearer token.
 */
export const adminApi = hc<AdminApp>(`${config.serverUrl}/admin`, { headers: () => authHeaders(sessionToken) });

/** An `<Image source>` for an attachment; it needs the session like any other admin call. */
export function attachmentSource(attachmentId: string) {
  return { uri: `${config.serverUrl}/admin/attachments/${attachmentId}`, headers: authHeaders(sessionToken) };
}
