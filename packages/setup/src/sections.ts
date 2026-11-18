import type { SetupInput } from "./types.ts";

const code = (lang: string, body: string) => "```" + lang + "\n" + body + "\n```";
const rust = (s: SetupInput) => s.platform === "rust";

export function events(s: SetupInput): string {
  const example = rust(s)
    ? `roost.track_event(TrackEvent::new("level_complete").prop("level", 3).prop("stars", 2).value(84.0));`
    : `roost?.track("level_complete", { level: 3, stars: 2 }, 84); // value: a number to sum or average`;
  return `## Track events

\`session_start\` and \`session_end\` are sent for you. Add events at the moments that matter for
this game. Names are snake_case (anything else is dropped); props are strings, numbers or booleans.

${code(rust(s) ? "rust" : "ts", example)}

Good first events, if the game has these moments: \`tutorial_step\` {step}, \`level_start\` /
\`level_complete\` / \`level_fail\` {level}, \`purchase\` {sku, price_cents}, \`ad_watched\` {placement}.
Don't send personal data (names, emails, chat text) as props.`;
}

export function crashes(s: SetupInput): string {
  const body = rust(s)
    ? `Panics are reported automatically.${s.features.nativeCrashes ? " Hard crashes (segfaults, aborts) are written as minidumps by the crash monitor and sent on the next launch." : ""}

${code("rust", `roost.set_tag("level", "forest-3");            // on every later report
roost.add_breadcrumb(Breadcrumb::new("save_loaded").category("save"));
if let Err(err) = load_save() {
    roost.capture_error(&err, Capture::new().tag("slot", 2));
}`)}`
    : `Uncaught errors are reported automatically (global handlers), saved to storage if the app is dying,
and sent on the next launch.

${code("ts", `roost?.setTag("level", "forest-3");               // on every later report
roost?.addBreadcrumb({ name: "save_loaded", category: "save" });
try { loadSave(); } catch (err) { roost?.captureError(err, { tags: { slot: "2" } }); }`)}`;
  return `## Crashes and errors\n\n${body}\n\nAdd tags for what you'd want to filter by (level, mode). Use \`beforeSend\` to scrub anything private.`;
}

export function reports(s: SetupInput): string {
  const example = rust(s)
    ? `// Off the render thread: report() waits for the upload.
std::thread::spawn(move || {
    let sent = roost.report(PlayerReport::new(text).attachment(Attachment::new("screenshot.png", png)));
    // show "Thanks!" or "Couldn't send, try again" from \`sent\`
});`
    : `const result = await roost?.report({
  message: text,                                   // what the player typed
  attachments: [{ name: "screenshot.png", data: pngBytes, contentType: "image/png" }],
});
// result.ok → "Thanks!", otherwise "Couldn't send, try again"`;
  return `## Player bug reports

Add a "Report a bug" button to the pause or settings menu: a text box, then send it with a screenshot
if the engine can grab one. The player's save goes along automatically if you set it up above.

${code(rust(s) ? "rust" : "ts", example)}`;
}

export function flags(s: SetupInput): string {
  const known = s.flags.length ? `\nFlags that exist now: ${s.flags.map((f) => `\`${f.key}\` (${f.type})`).join(", ")}.` : "";
  const example = rust(s)
    ? `let shop_enabled = roost.flag_bool("new_shop", false);
let tuning: Tuning = roost.flag_json("enemy.tuning", Tuning::default());`
    : `const shopEnabled = roost?.flags.getBoolean("new_shop", false) ?? false;
const tuning = roost?.flags.getObject("enemy.tuning", { hp: 100 }) ?? { hp: 100 };`;
  return `## Config and feature flags

Values the studio can change without an update. Always pass a default: it's used offline, before
the first fetch, or if the flag is removed. Values refresh every few minutes.${known}

${code(rust(s) ? "rust" : "ts", example)}

Add new flags to \`roost.config.json\` (below), not just in code.`;
}

export function ai(s: SetupInput): string {
  const known = s.templates.length ? `\nTemplates that exist now: ${s.templates.map((t) => `\`${t}\``).join(", ")}.` : "";
  const example = rust(s)
    ? `// Blocks for the model call: run it off the main thread.
let reply = roost.ai("npc_greeting", serde_json::json!({ "name": "Ada" }));
match reply { Ok(r) => show(r.text), Err(_) => show("Hello, traveler.") } // always have a fallback line`
    : `try {
  const reply = await roost!.aiStream("npc_greeting", { name: "Ada" }, { onDelta: (t) => appendToBubble(t) });
} catch {
  showLine("Hello, traveler."); // budget used up or offline: always have a fallback
}`;
  return `## AI (OpenRouter through Roost)

The game calls prompt templates by name; prompts, models and spend limits live on the server, so
no AI key ships in the build. Pass earlier turns as \`messages\` for conversations.${known}

${code(rust(s) ? "rust" : "ts", example)}

Define templates in \`roost.config.json\`.${
    rust(s)
      ? ""
      : `

To classify or score something (e.g. what kind of message a player wrote), use a decision model
such as \`liquid/d1.2\`: define it under \`decisions\` in \`roost.config.json\` and call
\`roost.decide("message_kind", { message })\`. Decisions throw on failure like \`ai\`.

To say a line out loud, define a speech template under \`speech\` in \`roost.config.json\` (a TTS
model such as \`openai/gpt-4o-mini-tts\` and the voices it may use) and call
\`roost.speak("narrator", text, { voice: "alloy" })\`. It resolves with \`{ audio, contentType }\`
and throws on failure like \`ai\`.`
  }`;
}

export function debugFiles(s: SetupInput): string {
  const body = rust(s)
    ? `${code("bash", `cargo install dump_syms
dump_syms target/release/my-game > my-game.sym                       # Linux; Windows: my-game.pdb
# macOS: dump_syms my-game.dSYM/Contents/Resources/DWARF/my-game > my-game.sym
pnpm --dir <roost repo> upload:debug-files --endpoint ${s.endpoint} --key "$ROOST_SERVER_KEY" my-game.sym`)}
Build releases with \`debug = true\` (or split debuginfo) so there are symbols to upload.`
    : code("bash", `# after building the release bundle, with source maps on
pnpm --dir <roost repo> upload:debug-files --endpoint ${s.endpoint} --key "$ROOST_SERVER_KEY" --build "$BUILD" dist/*.map`);
  return `## Debug files in CI

So crash stacks show your real function names and lines. Run this in the release job for every build;
\`ROOST_SERVER_KEY\` is a CI secret.

${body}`;
}

export function verify(s: SetupInput): string {
  return `## Check it works

1. Run the game and play for a minute.
2. In the Roost dashboard (${s.game} · ${s.environment}): **Events** shows your events within ~10 s.
3. Trigger a test error once (${rust(s) ? "`roost.capture_message(\"Roost test\", Capture::new())`" : '`roost?.captureMessage("Roost test")`'}) and see it under **Issues**.
4. Remove the test code.

**If nothing arrives:** look for a Roost warning in the app's logs first. Then rule out the key and
server with one request from your computer; \`202\` means they're fine and the problem is in the app:

\`\`\`bash
curl -s -o /dev/null -w "%{http_code}\\n" -X POST ${s.endpoint}/v1/events \\
  -H "x-roost-key: <client key>" -H "content-type: application/json" \\
  -d '{"context":{"build":"dev","platform":"web","sdk":"curl"},"events":[{"id":"00000000-0000-4000-8000-000000000001","name":"roost_setup_check","ts":"'"$(date -u +%FT%TZ)"'","sessionId":"setup-check","playerId":"setup-check"}]}'
\`\`\``;
}

