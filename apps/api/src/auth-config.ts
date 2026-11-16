import { email, type auth } from "@roost/core";
import type { Env } from "./env.ts";

export type AuthDeps = Omit<auth.OtpDeps, "db"> & { secureCookies: boolean };

/**
 * SIGNUP_ALLOWLIST decides who may create a NEW account (existing users can
 * always sign in). Comma-separated: `a@b.com` for one address, `@b.com` for a
 * whole domain, `*` for anyone. Empty means nobody new.
 */
export function signupPolicy(allowlist: string): (email: string) => boolean {
  const entries = allowlist
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return (address) =>
    entries.some((e) => e === "*" || e === address || (e.startsWith("@") && address.endsWith(e)));
}

export function authDepsFromEnv(env: Env): AuthDeps {
  const mailer = email.createMailer(
    env.EMAIL_PROVIDER === "smtp"
      ? { provider: "smtp", smtpUrl: env.SMTP_URL ?? "", from: env.EMAIL_FROM }
      : { provider: "resend", apiKey: env.RESEND_API_KEY ?? "", from: env.EMAIL_FROM },
  );
  return {
    secret: env.AUTH_SECRET,
    mailer,
    canSignUp: signupPolicy(env.SIGNUP_ALLOWLIST),
    secureCookies: env.NODE_ENV === "production",
  };
}
