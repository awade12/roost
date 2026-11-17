#!/usr/bin/env bash
# Deploys a commit of this repo on the server it runs on, and rolls back if it doesn't come up.
#
#   infra/deploy.sh                # latest origin/main
#   infra/deploy.sh <commit-sha>   # a specific commit (CI passes the one that passed tests)
#
# Steps: fetch, check out, build the new images while the old containers keep serving, back up
# (migrations can't be undone), swap the containers, wait until they're healthy. If the build or
# the health check fails, it checks out the previous commit and brings that back up.
#
# Run as the user that owns the checkout. Which compose files to use comes from COMPOSE_FILE in
# .env (e.g. infra/docker-compose.yml:infra/docker-compose.behind-proxy.yml), else the default.
# Also used as an SSH forced command for CI: then the commit arrives in SSH_ORIGINAL_COMMAND.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO=$(pwd)
LOG="$REPO/../roost-deploys.log"
WAIT_SECONDS=${DEPLOY_WAIT_SECONDS:-240}

log() { printf '%s deploy: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
fail() { log "FAILED: $*"; exit 1; }

# The requested commit: an argument, or (from CI over SSH) the original command. Only a
# commit hash or "main" is accepted, so nothing else can be smuggled into git or the shell.
REQ=${1:-${SSH_ORIGINAL_COMMAND:-main}}
[[ $REQ =~ ^([0-9a-f]{7,40}|main)$ ]] || fail "refusing '$REQ': pass a commit hash or main"

[ -f .env ] || fail "no .env in $REPO (see DEPLOY.md)"
COMPOSE_FILE=$(grep -E '^COMPOSE_FILE=' .env | tail -1 | cut -d= -f2- | tr -d "\"'" || true)
export COMPOSE_FILE=${COMPOSE_FILE:-infra/docker-compose.yml}
compose() { docker compose --env-file .env "$@"; }

# One deploy at a time (CI and a person could start one together).
exec 9>"$REPO/../.roost-deploy.lock"
flock -n 9 || fail "another deploy is running"

git fetch --quiet origin
[ "$REQ" = main ] && REQ=origin/main
TARGET=$(git rev-parse --verify --quiet "$REQ^{commit}") || fail "unknown commit $REQ (pushed to GitHub?)"
PREV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$TARGET" origin/main || fail "$TARGET is not on main"

if [ "$TARGET" = "$PREV" ] && [ "${DEPLOY_FORCE:-0}" != 1 ]; then
  log "already at ${TARGET:0:7}; nothing to do (DEPLOY_FORCE=1 to redo)"
  exit 0
fi

bring_up() {
  compose build --quiet && compose up -d --remove-orphans --wait --wait-timeout "$WAIT_SECONDS"
}

# Back to the previous commit's code AND images (images are tagged by service, not commit,
# so a half-finished build would otherwise be what the next `up` starts). Cached, so quick.
restore_prev() {
  git -c advice.detachedHead=false checkout --quiet --detach "$PREV"
  compose build --quiet || log "rebuilding ${PREV:0:7} images failed: run infra/deploy.sh ${PREV:0:7}"
}

rollback() {
  log "rolling back to ${PREV:0:7}"
  git -c advice.detachedHead=false checkout --quiet --detach "$PREV"
  if bring_up; then log "rolled back to ${PREV:0:7}"; else log "ROLLBACK FAILED: check 'docker compose logs'"; fi
  exit 1
}

log "deploying ${PREV:0:7} -> ${TARGET:0:7} ($(git log -1 --format=%s "$TARGET"))"
git -c advice.detachedHead=false checkout --quiet --detach "$TARGET"

# Build first: if it breaks, nothing has been touched yet.
compose build --quiet || { restore_prev; fail "build of ${TARGET:0:7}; still running ${PREV:0:7}"; }

# Back up before the new API applies its migrations. Skipped on a first deploy (no backup container yet).
if compose ps --status running --services | grep -qx backup; then
  compose exec -T -e BACKUP_ONCE=1 backup roost-backup >/dev/null || { restore_prev; fail "pre-deploy backup; still running ${PREV:0:7}"; }
  log "backup taken"
fi

compose up -d --remove-orphans --wait --wait-timeout "$WAIT_SECONDS" || { log "not healthy after ${WAIT_SECONDS}s"; rollback; }

docker image prune -f >/dev/null || true
log "deployed ${TARGET:0:7}"
