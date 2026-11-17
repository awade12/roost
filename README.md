# Roost

Self-hosted backend for our games (Expo mobile, custom Rust engine on Steam, web):
analytics, an AI proxy in front of OpenRouter, bug and crash reports, live-ops.

- Design: [SPEC.md](SPEC.md)
- Rules: [CLAUDE.md](CLAUDE.md)
- Changes: [CHANGELOG.md](CHANGELOG.md)

## Local dev

```bash
cp .env.example .env
pnpm install
pnpm db:up        # Postgres, ClickHouse, RustFS (S3) in Docker
pnpm db:migrate   # both databases
pnpm dev          # api :8787, dashboard :5173, worker
```

Sign in at http://localhost:5173 with any email. The code arrives in Mailpit:
http://localhost:8025. Who may create accounts is set by `SIGNUP_ALLOWLIST` in `.env`.

## Checks

```bash
pnpm check        # structure, lint, typecheck, tests
```

## SDKs, served by Roost

Games install the SDKs from your Roost server, so there's no npm or crates.io account to set up,
and nothing is public.
`pnpm build:sdks` packages them into `dist/sdk` (the API image does this at build time), and
`GET /sdk` shows the install lines:

Downloads need a Roost key; use a client key (it ships in games anyway), never a server key.

```bash
npm install "https://roost.example.com/sdk/js/latest.tgz?key=rk_client_…"   # Expo, web (also pnpm / yarn)
```

```toml
# .cargo/config.toml in the game repo
[registries.roost]
index = "sparse+https://roost.example.com/sdk/cargo/"
credential-provider = ["cargo:token"]

# Cargo.toml
roost-sdk = { version = "0.2", registry = "roost" }
```

```bash
cargo login --registry roost rk_client_…      # once per machine; CI sets CARGO_REGISTRIES_ROOST_TOKEN
```

Each game's **Set up in your game** dialog (or `pnpm roost init`) writes a `ROOST.md` with these
lines filled in, for a coding agent to follow.

## Manage a game from code

Everything you can set up in the dashboard for a game you can also keep in its repo. Use a
**server key** (`rk_server_…`, made under Settings → Games & keys); it never ships in a build.

```jsonc
// roost.config.json (or roost.config.ts exporting `config`)
{
  "templates": {
    "npc_greeting": { "model": "anthropic/claude-haiku-4.5", "userTemplate": "Greet {{name}} in one line." }
  },
  "flags": {
    "new_shop": { "type": "boolean", "value": false, "rollout": { "percent": 10, "value": true } }
  },
  "aiLimits": { "monthlyCapCents": 5000, "playerDailyTokens": 20000, "playerPerMinute": 10 }
}
```

```bash
export ROOST_ENDPOINT=https://roost.example.com ROOST_KEY=rk_server_…
pnpm roost pull                       # current config → roost.config.json
pnpm roost push --dry-run             # what would change
pnpm roost push --prune               # apply, and remove what's no longer in the file
```

Templates belong to the game; flags to the environment of the key you use (run `push` once
per environment). The same server key works with the HTTP API directly:

- `PUT /v1/manage/config`, `GET /v1/manage/config`, and per item: `PUT|DELETE /v1/manage/templates/:name`,
  `PUT|DELETE /v1/manage/flags/:key`, `PUT /v1/manage/ai-limits`, `GET|PUT /v1/manage/settings`
- `GET /v1/query/events`, `/v1/query/events/series`, `/v1/query/overview`, `/v1/query/retention`,
  `/v1/query/players/:playerId`, `/v1/query/issues`
- `POST /v1/ai/complete`: any prompt and model for your own servers and tools (counted against
  the game's AI limits). Games use templates through `/v1/ai/run`, which can take conversation
  history, per-call options within the template's bounds, and `stream: true`.
- `PUT /v1/debug-files/breakpad` and `/v1/debug-files/sourcemaps` (`pnpm upload:debug-files`)

## Contributing and security

- How to set up, the repo rules and how to send a change: [CONTRIBUTING.md](CONTRIBUTING.md)
- Found a vulnerability? Report it privately: [SECURITY.md](SECURITY.md)

## License

- **Server, dashboard, worker and everything else** in this repo:
  [FSL-1.1-ALv2](LICENSE) (Functional Source License). Use it, change it and self-host it for
  your own games; just don't offer it as a competing commercial product. Each version becomes
  [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) two years after its release.
- **SDKs** (`packages/sdk-js`, `sdks/rust`): [MIT](packages/sdk-js/LICENSE), so you can ship
  them in closed-source games.
