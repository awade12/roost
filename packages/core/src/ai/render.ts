const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Names of the {{placeholders}} a template uses, in order of first use. */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ""))];
}

/**
 * Fills {{placeholders}} from `vars`. Every placeholder must be provided, so a
 * game can't silently send a half-filled prompt. Extra vars are ignored.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | boolean>,
): { ok: true; text: string } | { ok: false; missing: string[] } {
  const missing = placeholders(template).filter((name) => !(name in vars));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, text: template.replace(PLACEHOLDER, (_, name: string) => String(vars[name])) };
}
