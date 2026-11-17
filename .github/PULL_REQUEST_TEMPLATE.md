## What and why

<!-- What this changes, and why. Link the issue if there is one. -->

## Checklist

- [ ] `pnpm check` passes (structure, lint, typecheck, tests)
- [ ] Tests added or updated (every route has an integration test, every bug fix a regression test)
- [ ] Rust SDK touched: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` pass
- [ ] `CHANGELOG.md` entry under `## [Unreleased]` (root for the server, the SDK's own for SDK changes), or the `skip-changelog` label
- [ ] Docs updated (README, SDK README, SPEC.md) if behaviour or setup changed
- [ ] `/v1` changes are additive only; migrations are new files, not edits
