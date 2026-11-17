import { ai, crashes, debugFiles, events, flags, reports, verify } from "./sections.ts";
import { init, install, keyEnv } from "./snippets.ts";
import type { SetupInput } from "./types.ts";

const PLATFORM: Record<SetupInput["platform"], string> = { expo: "Expo / React Native", web: "Web (JS/TS)", rust: "Rust (custom engine)" };

function header(s: SetupInput): string {
  const key = s.clientKey ? `\`${s.clientKey}\` (client key: safe to ship in builds)` : `read from \`${keyEnv(s)}\` (ask the user for the client key; create one in Roost → Settings → Games & keys)`;
  return `# Roost setup: ${s.game} (${s.environment})

> **For the coding agent.** Integrate the Roost SDK into this ${PLATFORM[s.platform]} game by working
> through the steps below in order. Make small, reviewable changes and match the project's style.
> If the SDK download below fails, stop and tell the user (the Roost server may need \`pnpm build:sdks\`).

| | |
|---|---|
| Endpoint | \`${s.endpoint}\` |
| Environment | ${s.environment} |
| Client key | ${key} |

## Rules

- **Never** put a server key (\`rk_server_…\`) in the game or the repo. Only CI may use one, as a secret.
- Telemetry must never break or slow the game: don't await Roost on the main path, and don't let its
  errors reach the player. The SDK already never throws from tracking or crash reporting.
- But never hide a Roost failure from developers: if you wrap the start in \`try/catch\`, log the
  error (\`console.warn\` in dev builds, \`eprintln!\` in Rust). A silent catch once hid a start-up
  error, and no events arrived with nothing in the logs to say why.
- Player ids are random per install. Never use names, emails or platform account ids.
- Event names are snake_case; keep props small and free of personal data.`;
}

/** Builds ROOST.md for a coding agent, with only the sections for the chosen features. */
export function buildGuide(s: SetupInput): string {
  const f = s.features;
  const parts = [
    header(s),
    `## Install\n\n${install(s)}`,
    `## Start Roost at launch\n\n${init(s)}${s.platform === "rust" ? "" : `\n\nCall \`startRoost()\` once when the app starts (don't block the first screen on it).`}`,
    events(s),
    f.crashes ? crashes(s) : "",
    f.reports ? reports(s) : "",
    f.flags ? flags(s) : "",
    f.ai ? ai(s) : "",
    f.debugFiles ? debugFiles(s) : "",
    `## Config as code

\`roost.config.json\` in the repo holds AI templates and flags. Apply it from CI or a terminal with a
server key (per environment):

\`\`\`bash
ROOST_ENDPOINT=${s.endpoint} ROOST_KEY="$ROOST_SERVER_KEY" pnpm --dir <roost repo> roost push --dry-run
\`\`\``,
    verify(s),
  ];
  return `${parts.filter(Boolean).join("\n\n")}\n`;
}

/** A starter roost.config.json: an example template and flag only for the features in use. */
export function buildConfigFile(s: SetupInput): string {
  const config = {
    templates: s.features.ai ? { npc_greeting: { model: "anthropic/claude-haiku-4.5", systemPrompt: `You are a character in ${s.game}. One short line.`, userTemplate: "Greet {{name}}." } } : {},
    flags: s.features.flags ? { new_shop: { type: "boolean", description: "Example: turn on gradually", value: false, rollout: { percent: 10, value: true } } } : {},
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
