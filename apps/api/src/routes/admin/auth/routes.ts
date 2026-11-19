import { zValidator } from "@hono/zod-validator";
import { auth } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { logger } from "../../../http/logger.ts";
import { clientIp, createLimiter } from "../../../http/rate-limit/index.ts";
import { clearSessionCookie, sessionToken, setSessionCookie } from "./session.ts";

const FIFTEEN_MIN = 15 * 60 * 1000;
const EmailBody = z.object({ email: z.email().max(254) });
// `client: "app"`: the mobile app wants the session token in the body instead of a cookie.
const VerifyBody = EmailBody.extend({ code: z.string().regex(/^\d{6}$/), client: z.literal("app").optional() });

const invalidBody = (result: { success: boolean }) => {
  if (!result.success) throw new AppError("bad_request", "Check the email and code and try again");
};

export function authRoutes({ db, auth: authDeps, rateLimits }: AppDeps) {
  const sendsPerEmail = createLimiter(rateLimits, { name: "otp-email", limit: 3, windowMs: FIFTEEN_MIN });
  const sendsPerIp = createLimiter(rateLimits, { name: "otp-ip", limit: 10, windowMs: FIFTEEN_MIN });
  const verifiesPerIp = createLimiter(rateLimits, { name: "verify-ip", limit: 20, windowMs: FIFTEEN_MIN });

  return new Hono()
    .post("/otp/start", zValidator("json", EmailBody, invalidBody), async (c) => {
      const { email } = c.req.valid("json");
      await sendsPerIp.hit(clientIp(c));
      await sendsPerEmail.hit(auth.normalizeEmail(email));
      try {
        await auth.startOtp({ db, ...authDeps }, email);
      } catch (err) {
        // Mail errors can contain the address; log only the error type.
        logger.error({ err: (err as Error).name, requestId: c.get("requestId") }, "sign-in email failed");
        throw new AppError("internal", "Couldn't send the email. Try again in a minute.");
      }
      // Same answer whether or not the email may sign in, so it can't be used to probe accounts.
      return c.json({ ok: true as const });
    })
    .post("/otp/verify", zValidator("json", VerifyBody, invalidBody), async (c) => {
      await verifiesPerIp.hit(clientIp(c));
      const { email, code, client } = c.req.valid("json");
      const user = await auth.verifyOtp({ db, secret: authDeps.secret }, email, code);
      if (!user) throw new AppError("bad_request", "That code is wrong or has expired");
      const session = await auth.createSession(db, user.id);
      if (client === "app") {
        return c.json({ ok: true as const, token: session.token, expiresAt: session.expiresAt.toISOString() });
      }
      setSessionCookie(c, session.token, session.expiresAt, authDeps.secureCookies);
      return c.json({ ok: true as const });
    })
    .post("/logout", async (c) => {
      const token = sessionToken(c);
      if (token) await auth.revokeSession(db, token);
      clearSessionCookie(c);
      return c.json({ ok: true as const });
    });
}
