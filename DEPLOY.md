# Deploy Roost on one server

This runs the whole stack on one VPS with Docker Compose: Postgres, ClickHouse, RustFS
(S3-compatible storage), the API, the worker, a daily backup job, and Caddy serving the
dashboard and API on one HTTPS domain. Everything is in `infra/docker-compose.yml`.

## Requirements

- A Linux VPS with Docker Engine and the Compose plugin (`docker compose version`).
  4 GB RAM is a comfortable minimum (ClickHouse wants about 2 GB); 2 vCPU; disk for your
  events plus a few GB. Building the images needs about 6 GB free and takes a while the first
  time (two Rust builds: the SDKs and `minidump-stackwalk`).
- A domain or subdomain, say `roost.example.com`, with an `A` (and `AAAA` if you have IPv6)
  record pointing at the server.
- Ports 80 and 443 open to the internet. Caddy needs both to get and renew the certificate.
  Nothing else should be exposed: Postgres, ClickHouse, RustFS and the API have no published ports.
- An email sender for sign-in codes: a [Resend](https://resend.com) API key with a verified
  domain, or any SMTP server.
- Optional: an [OpenRouter](https://openrouter.ai) key for the AI proxy.

## 1. Get the code and configure it

```bash
git clone <your Roost repo> roost && cd roost
cp .env.example .env
```

Edit `.env`. Lines marked `[deploy]` in the file need real values:

| Variable | What to put |
| --- | --- |
| `ROOST_DOMAIN` | `roost.example.com` (no scheme). Caddy gets the certificate for it. |
| `DASHBOARD_URL` | `https://roost.example.com`. Used in emails, alerts and Linear links. |
| `AUTH_SECRET` | `openssl rand -hex 32`. Shared by API and worker. Keep it: saved alert webhook URLs and Linear keys are encrypted with it. |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` (hex, because it goes into a connection URL). |
| `CLICKHOUSE_PASSWORD` | `openssl rand -hex 24`. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Bundled RustFS: `S3_ENDPOINT=http://s3:9000`, `S3_BUCKET=roost`, and long random keys (`openssl rand -hex 16` / `openssl rand -hex 32`); they create the RustFS account. External S3 (AWS, R2, B2…): its endpoint, bucket and keys, plus `S3_REGION` if it cares. |
| `EMAIL_PROVIDER` | `resend` (set `RESEND_API_KEY`) or `smtp` (set `SMTP_URL=smtp://user:pass@host:587`). |
| `EMAIL_FROM` | `"Roost <roost@example.com>"`, an address your provider lets you send from. |
| `SIGNUP_ALLOWLIST` | Who may create an account: `you@example.com`, `@yourstudio.com`, or a comma list. **Don't leave `*`** on a public server: anyone could sign up. |
| `OPENROUTER_API_KEY` | Optional. Without it the AI endpoints answer 503. |

You don't need to touch `DATABASE_URL`, `CLICKHOUSE_URL`, `CLICKHOUSE_DB`, `NODE_ENV` or
`PORT`: compose points the containers at the bundled services and sets production mode.
`.env` holds secrets: `chmod 600 .env`, and never commit it.

## 2. Start it

Every compose command below runs from the repo root and passes `.env` twice over: as
`--env-file` (for the `${…}` values in the compose file) and through `env_file` (for the apps).
An alias saves typing:

```bash
alias roost='docker compose --env-file .env -f infra/docker-compose.yml'
roost up -d --build
roost ps
roost logs -f api
```

On start the API applies any pending Postgres and ClickHouse migrations, logs
`migrations applied`, then `roost api listening`. Its health check passes after that, and only
then does the worker start. Caddy fetches the certificate on the first request; give it a
minute. `https://roost.example.com/health` should answer `{"ok":true}`.

## 3. First sign-in

1. Open `https://roost.example.com` and enter an email that `SIGNUP_ALLOWLIST` allows.
2. Enter the 6-digit code from the email. No email? See Troubleshooting.
3. Name your studio. You're its owner.
4. Settings → **Games & keys**: create a game. Each game gets environments and keys:
   **client keys** (`rk_client_…`) go in game builds; **server keys** (`rk_server_…`) are
   for CI and tools only and never ship.
5. Invite teammates from the Members page; an invite works even if the allowlist wouldn't let
   them sign up. Once you're set up you can tighten `SIGNUP_ALLOWLIST` (or empty it) and run
   `roost up -d` again.

## 4. Point the SDKs at it

The endpoint is your domain, `https://roost.example.com`. The server hosts the SDKs itself;
`https://roost.example.com/sdk` lists versions and install lines. In short:

```bash
# Expo / web
npm install "https://roost.example.com/sdk/js/latest.tgz?key=rk_client_…"
```

```toml
# Rust: .cargo/config.toml in the game repo
[registries.roost]
index = "sparse+https://roost.example.com/sdk/cargo/"
credential-provider = ["cargo:token"]
```

Then `cargo login --registry roost rk_client_…` and `roost-sdk = { version = "…", registry = "roost" }`.
In the dashboard, a game's **Set up in your game** dialog writes a `ROOST.md` with the endpoint,
key and start-up code filled in. Tools that use a server key read `ROOST_ENDPOINT` and `ROOST_KEY`.

## 5. Upgrading

```bash
git pull
roost up -d --build
```

Migrations run by themselves when the new API starts. They're append-only, and a Postgres
advisory lock makes sure only one process applies them at a time. Read `CHANGELOG.md` first for
anything marked **BREAKING**. To apply migrations yourself instead, set `MIGRATE_ON_START=false`
and run `pnpm db:migrate` from a checkout that can reach the databases.

Old images pile up; `docker image prune` now and then.

## 6. Backups

The `backup` service runs once a day at `BACKUP_HOUR` (UTC, default 3) and writes to the
same bucket as everything else:

- `s3://$S3_BUCKET/$BACKUP_PREFIX/postgres/roost-<stamp>.sql.gz`: a `pg_dump` (gzip).
- `s3://$S3_BUCKET/$BACKUP_PREFIX/clickhouse/<stamp>/`: ClickHouse's native
  `BACKUP DATABASE roost TO S3(…)`. ClickHouse uploads it itself, so `S3_ENDPOINT` must be
  reachable from the ClickHouse container (`http://s3:9000` is).

`<stamp>` looks like `20261117T030000Z`. `BACKUP_PREFIX` defaults to `backups`.

**The bundled RustFS lives on the same disk as the databases.** That protects against mistakes,
not against losing the server. For real backups use an external bucket (set the `S3_*`
variables to it, so attachments go there too), or copy the prefix off the box regularly, for
example with `rclone sync`.

Run one now and check it:

```bash
roost run --rm -e BACKUP_ONCE=1 backup
roost run --rm backup list
roost logs backup            # the nightly runs; a failed night logs FAILED and retries tomorrow
```

**Retention.** The job never deletes anything. Expire old backups with an S3 lifecycle rule on
the prefix. With the AWS CLI in the backup image (this replaces any lifecycle rules the bucket
already has):

```bash
roost run --rm --entrypoint sh backup -c 'aws --endpoint-url "$S3_ENDPOINT" s3api \
  put-bucket-lifecycle-configuration --bucket "$S3_BUCKET" --lifecycle-configuration \
  "{\"Rules\":[{\"ID\":\"roost-backups\",\"Status\":\"Enabled\",\"Filter\":{\"Prefix\":\"$BACKUP_PREFIX/\"},\"Expiration\":{\"Days\":30}}]}"'
```

On AWS, R2 or B2 you can set the same rule in their console instead. ClickHouse backups are
full copies each night, so keep the window as short as you're comfortable with.

### Restore

Restoring replaces the current data. Stop the apps first so nothing writes meanwhile:

```bash
roost stop api worker
roost run --rm backup list                                  # pick a <stamp>
roost run --rm backup restore postgres 20261117T030000Z     # drops and recreates the roost database
roost run --rm backup restore clickhouse 20261117T030000Z   # drops roost, then RESTORE DATABASE … FROM S3
roost up -d
```

The Postgres and ClickHouse stamps of one run match; restore both from the same night so issues
and their events line up. The restore checks that the dump exists before dropping anything.
On a new server: set up `.env` with the **same** `AUTH_SECRET` and `S3_*` values,
`roost up -d postgres clickhouse s3`, then the restore commands above, then `roost up -d`.

## Scaling notes

- **One API replica.** Rate limits (sign-in codes, invites, per-key requests) are kept in memory per process,
  so two replicas would each allow the full limit. Run one `api` until they move to Postgres.
  Startup migrations are already safe with several replicas.
- **Workers** can scale: `roost up -d --scale worker=2`. Jobs and the symbolication queue are
  shared through Postgres.
- **ClickHouse** holds the high-volume data (events, AI calls, crashes). It compresses events
  well (often 10x or more), so disk grows slowly, but memory matters: give it 2 GB or more, and
  more for big explorer queries over months of data. Watch disk with
  `roost exec clickhouse sh -c 'clickhouse-client -u "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" -d roost -q "SELECT table, formatReadableSize(sum(bytes_on_disk)) FROM system.parts WHERE active AND database = currentDatabase() GROUP BY table"'`.
- **Postgres** stays small: accounts, games, keys, issues, reports, config.
- When one box isn't enough, the next step is managed Postgres, ClickHouse and S3: point
  `S3_*` at the new bucket and change the URLs in the `x-app-env` block of
  `infra/docker-compose.yml`.

## Troubleshooting

- **`required variable … is missing a value`**: compose didn't get `.env`. Run from the repo
  root with `--env-file .env` (the alias above does).
- **The API restarts in a loop**: `roost logs api`. `Invalid environment: X, Y` names the
  missing or malformed variables. A migration error stops startup on purpose; fix the cause
  and restart, or restore a backup.
- **No certificate / browser warning**: DNS must point at this server and ports 80 and 443 must
  be open. `roost logs caddy` shows the ACME errors. Let's Encrypt rate-limits repeated failures,
  so fix DNS before retrying many times.
- **No sign-in email**: `roost logs api` for mailer errors. Check `EMAIL_FROM` is allowed by your
  provider (a verified domain on Resend) and that the VPS host doesn't block outbound SMTP (many
  block port 25; use 587 or Resend). Sign-in codes are never logged.
- **A new person never gets a code**: Roost silently sends nothing to addresses that have no
  account, no invite and aren't in `SIGNUP_ALLOWLIST` (so it can't be used to probe who has an
  account). Invite them from the Members page, or add them to the allowlist and `roost up -d`.
- **Attachments or crash dumps fail**: `roost logs api` shows `attachment bucket not ready`
  when S3 is unreachable. With the bundled RustFS, `S3_ENDPOINT` must be `http://s3:9000`, not
  `localhost`.
- **Native crashes stay unsymbolicated**: upload symbols (`pnpm upload:debug-files`); the worker
  logs symbolication errors.
- **Backup fails**: `roost logs backup`. Run `roost run --rm -e BACKUP_ONCE=1 backup` to see the
  error right away. Most often the S3 keys or endpoint are wrong, or ClickHouse can't reach
  `S3_ENDPOINT`.
- **Alert webhooks or Linear stop working after a redeploy**: `AUTH_SECRET` changed. Keep it the same
  across deploys and restores.
- **Port 80/443 already in use**: another web server is running; stop it or put Roost behind it
  and drop the `caddy` service.
