import type { SetupInput } from "./types.ts";

const KEY_ENV: Record<SetupInput["platform"], string> = { expo: "EXPO_PUBLIC_ROOST_KEY", web: "VITE_ROOST_KEY", rust: "ROOST_KEY" };

/** The key as code: the real one if given (client keys are safe in builds), else an env var. */
export function keyExpr(s: SetupInput): string {
  if (s.clientKey) return JSON.stringify(s.clientKey);
  return s.platform === "rust" ? `option_env!("${KEY_ENV.rust}").unwrap_or_default()` : s.platform === "expo" ? `process.env.${KEY_ENV.expo} ?? ""` : `import.meta.env.${KEY_ENV.web} ?? ""`;
}

export const keyEnv = (s: SetupInput) => KEY_ENV[s.platform];

/** The key as a shell word: the real client key if known, else the env var holding it. */
const shellKey = (s: SetupInput) => s.clientKey ?? `$${KEY_ENV[s.platform]}`;

/**
 * Installs from the Roost server itself (`pnpm build:sdks` publishes them there): no registry
 * accounts. Downloads need a Roost key; a client key is fine (it ships in the game anyway).
 */
export function install(s: SetupInput): string {
  if (s.platform === "rust") {
    const features = s.features.nativeCrashes ? `, features = ["native-crashes"]` : "";
    return `The SDK comes from this Roost server's own Cargo registry, which needs a Roost key.
Add \`.cargo/config.toml\` at the repo root:

\`\`\`toml
[registries.roost]
index = "sparse+${s.endpoint}/sdk/cargo/"
credential-provider = ["cargo:token"]
\`\`\`

Log in once per machine (CI: set the \`CARGO_REGISTRIES_ROOST_TOKEN\` secret to the same key instead):

\`\`\`bash
cargo login --registry roost ${shellKey(s)}
\`\`\`

Then in \`Cargo.toml\`:

\`\`\`toml
[dependencies]
roost-sdk = { version = "0.2", registry = "roost"${features} }
serde_json = "1"
\`\`\``;
  }
  const extra = s.platform === "expo" ? " @react-native-async-storage/async-storage expo-application" : "";
  return `The SDK is served by this Roost server and needs a Roost key in the URL (a client key is fine;
never a server key, since the URL is saved in package.json). Works with npm, pnpm and yarn:

\`\`\`bash
npm install "${s.endpoint}/sdk/js/latest.tgz?key=${shellKey(s)}"${extra}
\`\`\``;
}

export function init(s: SetupInput): string {
  if (s.platform === "rust") return initRust(s);
  const expo = s.platform === "expo";
  const lines = [
    `// src/roost.ts — one Roost client for the whole game.`,
    expo ? `import AsyncStorage from "@react-native-async-storage/async-storage";\nimport * as Application from "expo-application";\nimport { Platform } from "react-native";` : "",
    `import { Roost } from "@roost/sdk";`,
    ``,
    `const storage = ${expo ? "AsyncStorage" : "localStorage"};`,
    ``,
    `/** A random id per install, kept forever. Never use an email or real name. */`,
    `async function playerId(): Promise<string> {`,
    `  const saved = await storage.getItem("roost.player");`,
    `  if (saved) return saved;`,
    `  const id = crypto.randomUUID();`,
    `  await storage.setItem("roost.player", id);`,
    `  return id;`,
    `}`,
    ``,
    `/** Set once startRoost() has run. Code that might run earlier should use roost?.… */`,
    `export let roost: Roost | null = null;`,
    ``,
    `/** Call once at launch (e.g. in the root component's first effect). Never throws. */`,
    `export async function startRoost(): Promise<Roost> {`,
    `  roost ??= new Roost({`,
    `    endpoint: ${JSON.stringify(s.endpoint)},`,
    `    clientKey: ${keyExpr(s)},`,
    `    playerId: await playerId(),`,
    `    context: { build: ${expo ? `Application.nativeApplicationVersion ?? "dev"` : `import.meta.env.VITE_BUILD ?? "dev"`}, platform: ${expo ? `Platform.OS === "ios" ? "ios" : "android"` : `"web"`} },`,
    `    storage,`,
    s.features.crashes ? `    // Attach the player's save to every crash report (keep it small; 10 MB max per file):\n    // getAttachments: () => [{ name: "save.json", data: JSON.stringify(currentSave()) }],` : "",
    `  });`,
    `  await roost.start(); // loads anything unsent, sends saved crashes, starts flushing`,
    `  return roost;`,
    `}`,
  ];
  return "```ts\n" + lines.filter((l) => l !== "").join("\n") + "\n```";
}

function initRust(s: SetupInput): string {
  const native = s.features.nativeCrashes;
  const lines = [
    `use roost_sdk::{Config, Roost};`,
    ``,
    `fn main() {`,
    native ? `    // Must be first: this process may be Roost's crash monitor, not the game.\n    if roost_sdk::native::run_monitor_if_requested() {\n        return;\n    }` : "",
    `    let save_dir = game_data_dir(); // the folder your saves already live in`,
    `    let roost = Roost::start(`,
    `        Config::new(${JSON.stringify(s.endpoint)}, ${keyExpr(s)}, player_id(&save_dir), env!("CARGO_PKG_VERSION"))`,
    `            .data_dir(&save_dir) // unsent data survives a crash or quit`,
    `            .in_app("my_game::") // your crate name(s): issues group on your own frames`,
    native ? `            .native_crashes(true)` : "",
    `    )`,
    `    .ok(); // never fail the game over telemetry; None just means no reporting`,
    `    // Keep \`roost\` (e.g. in a OnceLock or your App struct) for the whole run.`,
    `}`,
    ``,
    `/// A random id per install, saved next to the game data. Never use a Steam name or email.`,
    `fn player_id(dir: &std::path::Path) -> String {`,
    `    let path = dir.join("roost-player-id");`,
    `    std::fs::read_to_string(&path).unwrap_or_else(|_| {`,
    `        let id = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());`,
    `        let _ = std::fs::write(&path, &id);`,
    `        id`,
    `    })`,
    `}`,
  ];
  return "```rust\n" + lines.filter((l) => l !== "").join("\n") + "\n```";
}
