# @roost/sdk

The Roost SDK for Expo (React Native) and web games: analytics events,
crash and error reports, player bug reports, remote config and feature flags, and the
Roost AI proxy. It has no runtime dependencies.

It never throws from tracking or crash reporting, and it keeps working offline: events and
crash reports are saved and sent when the game is back online.

## Install

Roost serves the SDK itself. Install it from your Roost server with a **client key**
(`rk_client_…`, it ships in the game anyway; never use a server key here):

```bash
npm install "https://<roost>/sdk/js/latest.tgz?key=rk_client_…"
# pnpm add / yarn add work the same way
```

`GET https://<roost>/sdk` lists the versions and install lines. Publishing to npm comes later.

## Quick start

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Roost } from "@roost/sdk";

// Works on Hermes (React Native) as is: no crypto polyfill needed. For ids, use the SDK's
// uuid() rather than crypto.randomUUID(), which Hermes lacks.
export const roost = new Roost({
  endpoint: "https://roost.example.com",
  clientKey: "rk_client_…",
  playerId: "player-123",                  // a stable id per install: uuid() once, then keep it
  context: { build: "1.4.2", platform: "ios", osVersion: "18.1", locale: "en-GB" },
  storage: AsyncStorage,                   // localStorage on web; memory only if left out
});

await roost.start();

roost.track("level_complete", { level: 3, hard_mode: true }, 42);
```

`start()` loads anything left from the last launch (queued events, saved crash reports and
flags), sends saved crash reports, fetches flags, starts the flush timer, installs the crash
handlers and tracks `session_start`. `stop()` tracks `session_end`, removes the handlers and
flushes.

### Options

| Option | Default | What it does |
|---|---|---|
| `endpoint` | required | Your Roost server, e.g. `https://roost.example.com` |
| `clientKey` | required | The game environment's client key |
| `playerId` | required | Who is playing |
| `context` | required | `build`, `platform` (`ios`, `android`, `web`, `windows`, `macos`, `linux`), and optional `osVersion`, `deviceModel`, `locale` |
| `storage` | memory | Anything with `getItem` / `setItem` (sync or async): AsyncStorage, localStorage |
| `flushIntervalMs` | `10000` | How often queued events are sent |
| `captureCrashes` | `true` | Install the global error handlers |
| `maxBreadcrumbs` | `50` | Recent events and breadcrumbs kept for reports (max 100) |
| `beforeSend` | none | Edit a crash report, or return `null` to drop it |
| `getAttachments` | none | Files attached to every report, e.g. the save |
| `configRefreshMs` | `300000` | How often flags are re-fetched |
| `fetch` | global `fetch` | A custom fetch (tests, proxies) |

## Events

```ts
roost.track(name, props?, value?);
await roost.flush(); // send now; also runs every flushIntervalMs
```

`props` values are strings, numbers, booleans or `null`. Events are batched and queued in
`storage` (up to 5000), so nothing is lost while the player is offline. Every tracked event
also becomes a breadcrumb on later crash reports.

## Crashes and errors

With `captureCrashes` on (the default), the SDK hooks React Native's global handler
(`ErrorUtils`, keeping React Native's own behaviour) or, in a browser, the `error` and
`unhandledrejection` events. Reports are saved before they're sent, so a fatal crash that
kills the app is delivered on the next launch.

```ts
try {
  loadSave(slot);
} catch (error) {
  void roost.captureError(error, {
    tags: { slot: String(slot) },
    extra: { saveVersion: 7 },
    fingerprint: ["save-corrupt"],          // group by this instead of the stack
  });
}

void roost.captureMessage("Save migration fell back to defaults", { level: "warning" });
```

`captureError(error, options)` and `captureMessage(message, options)` never throw. Options:
`fatal`, `level` (`fatal`, `error`, `warning`, `info`), `tags`, `contexts`, `extra`,
`fingerprint`, and `attachments` for this report only.

Data that goes on every later report:

```ts
roost.setTag("level", "forest-3");          // searchable in the dashboard
roost.removeTag("level");
roost.setContext("match", { round: 3 });    // null removes it
roost.setExtra("difficulty", "hard");
roost.addBreadcrumb({ name: "save_loaded", category: "save", level: "info", message: "slot 2" });
```

Scrub or drop reports, and attach files to every report:

```ts
new Roost({
  // …
  beforeSend: (report) => (report.message.includes("debug") ? null : report),
  getAttachments: () => [{ name: "save.json", data: JSON.stringify(save) }],
});
```

An attachment is `{ name, data: string | Uint8Array, contentType? }`. Up to 5 files, 10 MB
each; fatal crashes keep up to 2 MB, since they have to be saved before the app exits. Files
upload after the report, and retry on the next launch if offline.

## Player bug reports

For a "Report a bug" button. Sent right away (not queued), with the current tags, contexts,
breadcrumbs and `getAttachments` files, and it never throws:

```ts
const result = await roost.report({
  message: "The door after the boss never opens",
  category: "bug",                          // "bug" | "feedback" | "crash" | "other"
  attachments: [{ name: "screenshot.png", data: pngBytes, contentType: "image/png" }],
  email: playerEmail,                       // only if the player chose to share it
});
if (result.ok) showThanks(result.id);
else showRetry(result.error);
```

Also takes `tags`, `extra`, and `includeAttachments: false` to skip `getAttachments`.

## Remote config and flags

Flags are resolved for this player on the server and read from memory, so reads never wait
on the network. They're fetched at `start()` and every `configRefreshMs`, and kept in
`storage` for offline launches. A missing flag, or one of the wrong type, returns your default.

```ts
if (roost.flags.getBoolean("new_shop", false)) showNewShop();
const greeting = roost.flags.getString("greeting", "Hello");
const spawnRate = roost.flags.getNumber("spawn_rate", 1);
const tuning = roost.flags.getObject("enemy.tuning", { hp: 100 });

const unsubscribe = roost.flags.onChange(() => rerender());
await roost.flags.refresh();                // fetch now; true if anything changed
roost.flags.details("new_shop", false, "boolean"); // { value, variant, reason, errorCode? }
```

Already using OpenFeature? Plug Roost in as a provider (no OpenFeature dependency in the SDK):

```ts
import { OpenFeature } from "@openfeature/web-sdk";

await OpenFeature.setProviderAndWait(roost.openFeatureProvider());
OpenFeature.getClient().getBooleanValue("new_shop", false);
```

## AI

Runs a prompt template from the dashboard on the Roost AI proxy. Unlike tracking, AI calls
throw `RoostAiError` on failure (with the API's `code`, e.g. `rate_limited` when the player's
budget is used up), so the game can show its own fallback line.

```ts
import { RoostAiError } from "@roost/sdk";

try {
  const { text, model, usage } = await roost.ai("npc_greeting", { name: "Ada" });
  say(text);
} catch (e) {
  if (e instanceof RoostAiError && e.code === "rate_limited") say("Hmm?");
  else throw e;
}
```

Options: `messages` (earlier turns, `{ role: "user" | "assistant", content }`), `model` (one
of the template's models), `maxTokens` (up to the template's limit) and `temperature`.

Stream the answer as it's written, for typewriter dialogue:

```ts
const answer = await roost.aiStream("npc_chat", { name: "Ada" }, {
  messages: history,
  onDelta: (piece) => appendToBubble(piece),
});
```

## Offline behaviour

- Events are queued in `storage` and sent in batches; a failed send keeps them for the next
  try. The queue keeps the newest 5000.
- Crash reports are saved before sending and retried on the next launch; their files too.
- Flags are kept in `storage`, so an offline launch uses the last values.
- `report()` and `ai()` need the network: `report()` returns `{ ok: false, error: "offline" }`,
  `ai()` throws.

## License

MIT, see `LICENSE`. The Roost server itself is under a different license (FSL-1.1-ALv2);
see the [Roost repository](https://github.com/awade12/roost).
