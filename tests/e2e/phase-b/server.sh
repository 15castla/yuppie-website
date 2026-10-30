#!/bin/bash
# Start or stop this worktree's Next server for the Phase B scripts, by PID (never pkill).
#   tests/e2e/phase-b/server.sh start [prod|dev] [port]   # prod needs a build first (with the same flags: see below)
#   tests/e2e/phase-b/server.sh stop [port]
# The stage 2 switches are on (Open Invite, Messages, Notifications, the photo gate), plus the local stack's
# app.env, MEMBERS_TEST_HOOKS=on (the test hook route and the cron fake clock), ADMIN_ALERTS_EMAIL=bf.alerts@...
# NEXT_PUBLIC_ switches are baked in at build time: build with
#   tests/e2e/phase-b/server.sh build
# (it takes /tmp/next-build.lock). The Phase A scripts need a build with the switches off (their own server.sh).
set -e
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
CMD=${1:-start}
if [ "$CMD" = stop ]; then PORT=${2:-3241}; else MODE=${2:-prod}; PORT=${3:-3241}; fi
PIDFILE=/tmp/phase-b-server-$PORT.pid
LOG=/tmp/phase-b-server-$PORT.log
flags() {
  export NEXT_PUBLIC_MEMBERS_OPEN_INVITE=on NEXT_PUBLIC_MEMBERS_MESSAGES=on NEXT_PUBLIC_MEMBERS_NOTIFICATIONS=on NEXT_PUBLIC_MEMBERS_PHOTO_GATE=on
}
if [ "$CMD" = stop ]; then
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    P=$(cat "$PIDFILE")
    for C in $(pgrep -P "$P" || true); do kill "$C" 2>/dev/null || true; done
    kill "$P"; echo "stopped $P"
  fi
  rm -f "$PIDFILE"
  exit 0
fi
cd "$ROOT"
set -a; . /home/claude/stack/app.env; set +a
flags
export MEMBERS_TEST_HOOKS=on MEMBERS_PREVIEW=1 ADMIN_ALERTS_EMAIL=${ADMIN_ALERTS_EMAIL:-bf.alerts@example.com}
if [ "$CMD" = build ]; then
  exec flock /tmp/next-build.lock node node_modules/next/dist/bin/next build --webpack
fi
if [ "$MODE" = dev ]; then
  nohup node node_modules/next/dist/bin/next dev --webpack -p "$PORT" > "$LOG" 2>&1 &
else
  nohup node node_modules/next/dist/bin/next start -p "$PORT" > "$LOG" 2>&1 &
fi
echo $! > "$PIDFILE"
for i in $(seq 1 90); do
  if curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:$PORT/member-login"; then echo "up on $PORT (pid $(cat "$PIDFILE"), $MODE, log $LOG)"; exit 0; fi
  sleep 1
done
echo "did not start; see $LOG"; exit 1
