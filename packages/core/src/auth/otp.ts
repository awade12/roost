import { otpCodes, type Db } from "@roost/db";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { otpEmail, type Mailer } from "../email/index.ts";
import { hmac, normalizeEmail, randomCode, safeEqual } from "./tokens.ts";
import { findUserByEmail, upsertUser } from "./users.ts";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpDeps = {
  db: Db;
  /** HMAC key for codes (AUTH_SECRET). */
  secret: string;
  mailer: Mailer;
  /** May this email create a new account? Existing users can always sign in. */
  canSignUp: (email: string) => boolean;
};

// The email is part of the HMAC input so a code is only valid for the address it was sent to.
const codeHash = (secret: string, email: string, code: string) => hmac(secret, `${email}:${code}`);

/**
 * Emails a sign-in code. Silently does nothing for an email that may not sign
 * up, so callers can always answer "check your inbox" without revealing anything.
 */
export async function startOtp(deps: OtpDeps, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!(await findUserByEmail(deps.db, email)) && !deps.canSignUp(email)) return;

  const code = randomCode();
  await deps.db.transaction(async (tx) => {
    // Only the newest code works: sending a new one kills the old ones.
    await tx
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt)));
    await tx.insert(otpCodes).values({
      email,
      codeHash: codeHash(deps.secret, email, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
  });
  await deps.mailer.send(otpEmail(email, code, OTP_TTL_MS / 60_000));
}

/** Checks a code. On success it is used up and the user (created if new) is returned. */
export async function verifyOtp(deps: Pick<OtpDeps, "db" | "secret">, rawEmail: string, code: string) {
  const { db, secret } = deps;
  const email = normalizeEmail(rawEmail);
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return null;

  if (!safeEqual(codeHash(secret, email, code), row.codeHash)) {
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(and(eq(otpCodes.id, row.id), lt(otpCodes.attempts, OTP_MAX_ATTEMPTS)));
    return null;
  }
  // The consumedAt guard makes two simultaneous verifies of one code succeed only once.
  const used = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  if (used.length === 0) return null;
  return upsertUser(db, email);
}
