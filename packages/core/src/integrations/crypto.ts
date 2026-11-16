import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Third-party API keys must be usable later, so they're encrypted (not hashed).
// The key is derived from AUTH_SECRET, so there's no extra secret to manage;
// rotating AUTH_SECRET means re-entering integration keys.
function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "roost", "integrations-v1", 32));
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function seal(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function open(secret: string, sealed: string): string {
  const raw = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
