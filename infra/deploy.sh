#!/usr/bin/env bash
# Deploy DigiPuls on the VPS: the only thing that changes the running stack.
#
#   ./infra/deploy.sh          # deploy origin/main
#
# Run by infra/poll.sh when main moves, or by hand. Nothing on the box is
# edited directly; the repository is the source of truth.
set -euo pipefail
cd "$(dirname "$0")/.."

exec 9>/tmp/digipuls-deploy.lock
if ! flock -w 900 9; then
  echo "another deploy has held the lock for 15 minutes; giving up" >&2
  exit 1
fi

COMPOSE="docker compose --env-file .env -f infra/compose.yml"
BACKUP_DIR=/var/backups/digipuls

# Update the checkout, then re-exec so the rest runs the script as updated.
if [ -z "${DEPLOY_REEXEC:-}" ]; then
  git fetch --quiet origin main
  PREVIOUS=$(git rev-parse HEAD)
  git reset --hard origin/main
  echo "==> $PREVIOUS -> $(git rev-parse --short HEAD)"
  export DEPLOY_REEXEC=1 DEPLOY_PREVIOUS="$PREVIOUS"
  exec bash "$0" "$@"
fi
PREVIOUS="${DEPLOY_PREVIOUS:?}"

# A dump before anything changes: the new container runs migrations on start.
if $COMPOSE ps --status running --services 2>/dev/null | grep -qx backup; then
  echo "==> pre-deploy database dump"
  $COMPOSE exec -T backup sh -c \
    'mariadb-dump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" --single-transaction --no-tablespaces "$DB_NAME"' \
    < /dev/null | gzip > "$BACKUP_DIR/digipuls-predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
fi

echo "==> build"
IMAGE_BEFORE=$(docker image inspect digipuls-app:latest --format '{{.Id}}' 2>/dev/null || echo none)
$COMPOSE build
IMAGE_AFTER=$(docker image inspect digipuls-app:latest --format '{{.Id}}' 2>/dev/null || echo none)

echo "==> up"
$COMPOSE up -d --remove-orphans
if [ "$IMAGE_BEFORE" != "$IMAGE_AFTER" ]; then
  echo "==> app image changed - recreating the app"
  $COMPOSE up -d --force-recreate digipuls
fi

docker image prune -f >/dev/null

echo "==> verifying"
for _ in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:3100/healthz >/dev/null 2>&1; then
    echo "    healthy"
    echo "==> deployed $(git rev-parse --short HEAD)"
    echo "    previous: $PREVIOUS"
    exit 0
  fi
  sleep 2
done
echo "    NOT HEALTHY after 90s - see: $COMPOSE logs --tail 50 digipuls" >&2
exit 1
