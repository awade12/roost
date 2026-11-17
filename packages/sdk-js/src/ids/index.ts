type MaybeCrypto = { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array };

/**
 * A v4 UUID that works on every JS engine games run on. Hermes (React Native) has no
 * `crypto.randomUUID`, and without a polyfill no `crypto` at all, so fall back to
 * `getRandomValues`, then `Math.random`. These IDs only deduplicate events and group
 * sessions, so they don't need to be unguessable.
 */
export function uuid(): string {
  const c = (globalThis as { crypto?: MaybeCrypto }).crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
