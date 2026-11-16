import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Keyed hash. Used for OTP codes: a 6-digit code is too small a space for a plain hash. */
export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** 256-bit random token for session cookies. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function randomCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
