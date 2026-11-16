import { storage, type email } from "@roost/core";
import type { AuthDeps } from "../auth-config.ts";
import { signupPolicy } from "../auth-config.ts";

/** Collects emails instead of sending them, so tests can read the sign-in code. */
export function memoryMailer() {
  const sent: email.EmailMessage[] = [];
  return {
    sent,
    async send(message: email.EmailMessage) {
      sent.push(message);
    },
    lastCode(): string | undefined {
      return sent.at(-1)?.subject.match(/^(\d{6}) /)?.[1];
    },
  };
}

export function testAuthDeps(mailer = memoryMailer(), allowlist = "@test.roost"): AuthDeps {
  return {
    secret: "test-secret-test-secret-test-secret!",
    mailer,
    canSignUp: signupPolicy(allowlist),
    secureCookies: false,
  };
}

type TestApp = { request: (path: string, init?: RequestInit) => Response | Promise<Response> };

/** Signs in through the real OTP routes and returns the session cookie. */
export async function signIn(app: TestApp, mailer: ReturnType<typeof memoryMailer>, email: string) {
  const post = (path: string, body: unknown) =>
    app.request(`/admin/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  await post("/otp/start", { email });
  const res = await post("/otp/verify", { email, code: mailer.lastCode() });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** Creates an org, a game and a client key through the admin API. */
export async function setupStudio(app: TestApp, cookie: string, gameName = "Test Game") {
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/admin${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return (await res.json()) as Record<string, unknown>;
  };
  const orgId = String((await call("POST", "/orgs", { name: "Test org" })).id);
  const gameId = String((await call("POST", `/orgs/${orgId}/games`, { name: gameName })).id);
  const { games } = (await call("GET", `/orgs/${orgId}/games`)) as { games: { environments: { id: string }[] }[] };
  const envId = games[0]?.environments[0]?.id ?? "";
  const key = String((await call("POST", `/environments/${envId}/keys`, { kind: "client" })).raw);
  return { orgId, gameId, envId, key };
}

/** Storage and Linear deps for tests: in-memory files, no real Linear calls. */
export function testExtras(linearFetch?: typeof fetch) {
  return { storage: storage.memoryStorage(), linear: { dashboardUrl: "https://roost.test", ...(linearFetch ? { fetch: linearFetch } : {}) } };
}
