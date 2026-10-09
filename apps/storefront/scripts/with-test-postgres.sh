#!/usr/bin/env bash
# Runs a command against a THROWAWAY local Postgres 16 cluster and always removes it.
#
#   scripts/with-test-postgres.sh                      -> npm run test:integration
#   scripts/with-test-postgres.sh npx vitest run       -> any other command
#
# The cluster lives in a fresh directory under /tmp, listens on 127.0.0.1 only (default port
# 54340, or the next free one), uses trust auth for the local `postgres` user, and holds one
# database, crater_test. TEST_DATABASE_URL is exported to the command. Nothing here ever
# touches a database you did not just create.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
[ -x "$PGBIN/initdb" ] || { echo "[test-postgres] $PGBIN/initdb not found; set PGBIN" >&2; exit 2; }

port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
PORT="${TEST_PG_PORT:-54340}"
for _ in $(seq 1 50); do port_free "$PORT" && break; PORT=$((PORT + 1)); done
port_free "$PORT" || { echo "[test-postgres] no free port found" >&2; exit 2; }

DATA="$(mktemp -d /tmp/crater-test-pg.XXXXXX)"
STARTED=0
# Run a command as the postgres OS user (initdb refuses root). When already non-root, run directly.
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

cleanup() {
  status=$?
  if [ "$STARTED" = 1 ]; then as_pg "$PGBIN/pg_ctl" -D "$DATA/pgdata" -m immediate stop >/dev/null 2>&1 || true; fi
  rm -rf "$DATA"
  echo "[test-postgres] cluster on port $PORT stopped and removed"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if [ "$(id -u)" = 0 ]; then chown postgres:postgres "$DATA"; fi
chmod 700 "$DATA"
as_pg "$PGBIN/initdb" -D "$DATA/pgdata" -U postgres --auth=trust --encoding=UTF8 >/dev/null
as_pg "$PGBIN/pg_ctl" -D "$DATA/pgdata" -w -t 60 -l "$DATA/server.log" \
  -o "-p $PORT -h 127.0.0.1 -k $DATA -c fsync=off -c listen_addresses=127.0.0.1" start >/dev/null
STARTED=1
as_pg "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres crater_test

export TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$PORT/crater_test"
echo "[test-postgres] throwaway cluster ready on 127.0.0.1:$PORT (database crater_test)"
if [ "$#" -eq 0 ]; then set -- npm run test:integration; fi
"$@"
