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
