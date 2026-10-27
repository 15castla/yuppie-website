#!/bin/bash
# Start or stop this worktree's Next server for the Phase A scripts, by PID (never pkill).
#   tests/e2e/phase-a/server.sh start [prod|dev] [port]   # prod needs `next build --webpack` first
#   tests/e2e/phase-a/server.sh stop [port]
# Env: the local stack's app.env, MEMBERS_TEST_HOOKS=on (the test hook route), MEMBERS_PREVIEW=1 (the preview harness),
# ADMIN_ALERTS_EMAIL=f.alerts@example.com.
set -e
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
CMD=${1:-start}
if [ "$CMD" = stop ]; then PORT=${2:-3141}; else MODE=${2:-prod}; PORT=${3:-3141}; fi
PIDFILE=/tmp/phase-a-server-$PORT.pid
LOG=/tmp/phase-a-server-$PORT.log
if [ "$CMD" = stop ]; then
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    P=$(cat "$PIDFILE")
    # The server's own child (next dev runs next-server under it), by parent PID, then the server.
    for C in $(pgrep -P "$P" || true); do kill "$C" 2>/dev/null || true; done
    kill "$P"; echo "stopped $P"
  fi
  rm -f "$PIDFILE"
  exit 0
fi
cd "$ROOT"
set -a; . /home/claude/stack/app.env; set +a
export MEMBERS_TEST_HOOKS=on MEMBERS_PREVIEW=1 ADMIN_ALERTS_EMAIL=${ADMIN_ALERTS_EMAIL:-f.alerts@example.com}
if [ "$MODE" = dev ]; then
  nohup node node_modules/next/dist/bin/next dev --webpack -p "$PORT" > "$LOG" 2>&1 &
else
  nohup node node_modules/next/dist/bin/next start -p "$PORT" > "$LOG" 2>&1 &
fi
echo $! > "$PIDFILE"
for i in $(seq 1 60); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/member-login"; then echo "up on $PORT (pid $(cat "$PIDFILE"), $MODE, log $LOG)"; exit 0; fi
  sleep 1
done
echo "did not start; see $LOG"; exit 1
