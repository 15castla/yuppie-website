#!/bin/bash
# The local test copy of the site, on this Mac (Albert, 19 Nov 2026: "from now on we need to test locally prior to
# pushing"; he chose "A test copy on your Mac"). A Docker container with its own database, made-up data and stand-ins
# for Stripe, Resend, Twilio, Anthropic and Apple's push service, so nothing reaches the live site or a real service.
# Every change: the full tests run here, then Albert tries it on http://localhost:3241, and only then is it pushed.
# Needs Docker Desktop running. See tests/local/README.md.
#
#   tests/local/local-test.sh up          first time (or after reset): build the machine (about 10 to 20 minutes the
#                                         first time), set up its database, then the same as refresh
#   tests/local/local-test.sh refresh     copy in this folder's code as it is now (the branch checked out), a fresh
#                                         database with every migration, build the site, start it with made-up data
#   tests/local/local-test.sh test [NN]   the full tests (about an hour), or only the scripts numbered (test 24 28)
#   tests/local/local-test.sh login       how to log in to the copy
#   tests/local/local-test.sh code [dk.]  the 6-digit authenticator code for the local log in (Kira's with dk.)
#   tests/local/local-test.sh stop        stop the copy (it keeps everything; refresh starts it again)
#   tests/local/local-test.sh reset       delete the copy and its data (the next up starts from nothing)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
NAME=yuppie-test-copy
IMAGE=yuppie-test-copy:1
cmd=${1:-help}
shift || true

docker info >/dev/null 2>&1 || { echo "Docker isn't running. Open Docker Desktop, wait until it says it's running, and try again."; exit 1; }

running() { [ "$(docker inspect -f '{{.State.Running}}' $NAME 2>/dev/null)" = "true" ]; }
exists() { docker inspect $NAME >/dev/null 2>&1; }

# this folder's code as it is checked out (the files git tracks; not node_modules, builds or Claude outputs) into the container
copy_in() {
  docker exec $NAME bash -c 'cd /home/claude/co && find . -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .next -exec rm -rf {} +'
  # (COPYFILE_DISABLE: no macOS ._ files in the copy)
  (cd "$ROOT" && git ls-files -z --cached | COPYFILE_DISABLE=1 tar --null -T - -cf -) | docker exec -i $NAME tar --warning=no-unknown-keyword -xf - -C /home/claude/co
}

ensure_running() {
  exists || { echo "No test copy yet: run tests/local/local-test.sh up"; exit 1; }
  if ! running; then
    docker start $NAME >/dev/null
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh start >/dev/null
  fi
}

case "$cmd" in
  up)
    # the machine, the packages and the build take about 8 GB: stop early rather than fill the disk
    free_gb=$(( $(df -Pk "$ROOT" | awk 'NR==2 {print $4}') / 1024 / 1024 ))
    if [ "$free_gb" -lt 15 ] && [ "${FORCE:-}" != 1 ]; then
      echo "Only ${free_gb} GB free on this disk; the test copy needs about 8 GB and the Mac needs room to breathe."
      echo "Free some space first (or run with FORCE=1 to go ahead anyway)."
      exit 1
    fi
    echo "Building the test machine (the first time takes a while)..."
    docker build -t $IMAGE -f "$ROOT/tests/local/Dockerfile" "$ROOT/tests/local"
    docker rm -f $NAME >/dev/null 2>&1 || true
    # only this Mac can reach it: the site on 3241, the database's web door on 54321 (the browser logs in through it)
    docker run -d --name $NAME -p 127.0.0.1:3241:3241 -p 127.0.0.1:54321:54321 $IMAGE >/dev/null
    copy_in
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh setup
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh refresh
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh login
    ;;
  refresh)
    ensure_running
    copy_in
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh refresh
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh login
    ;;
  test)
    ensure_running
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh test "$@"
    ;;
  login)
    ensure_running
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh login
    ;;
  code)
    ensure_running
    docker exec $NAME bash /home/claude/co/tests/local/inside.sh code "${1:-bf.}"
    ;;
  stop)
    docker stop $NAME >/dev/null 2>&1 && echo "Stopped. tests/local/local-test.sh refresh starts it again." || echo "It wasn't running."
    ;;
  reset)
    docker rm -f $NAME >/dev/null 2>&1 || true
    echo "Deleted the test copy and its data. tests/local/local-test.sh up makes a new one."
    ;;
  *)
    sed -n '2,17p' "$0"
    ;;
esac
