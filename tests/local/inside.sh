#!/bin/bash
# The local test copy, inside its container (tests/local/README.md). tests/local/local-test.sh on the Mac calls this;
# you don't run it yourself.
#   inside.sh setup            the stack from nothing (once, or after a reset)
#   inside.sh start            the stack again after the container restarts
#   inside.sh refresh          the code that was just copied in: packages if they changed, a fresh database (every
#                              migration from the baseline), the test people, the site built and started on 3241,
#                              and the made-up desk
#   inside.sh test [NN ...]    the phase B tests (all, or the scripts named by number), with a summary
#   inside.sh code [prefix]    the authenticator code for a local admin (bf. Albert, dk. Kira)
#   inside.sh login            how to log in to the copy
set -uo pipefail
S=/home/claude/stack
CO=/home/claude/co
B=$CO/tests/e2e/phase-b
cmd=${1:-help}
shift || true

envs() { set -a; . $S/app.env; set +a; }

case "$cmd" in
  setup)
    # the stack's scripts from the repo (bin/ and node_modules/ come with the machine)
    cp -r $CO/tests/local/stack/. $S/
    bash $S/setup.sh
    ;;
  start)
    cp -r $CO/tests/local/stack/. $S/ 2>/dev/null
    bash $S/up.sh
    # and the site, when it has been built
    [ -d $CO/.next ] && bash $B/server.sh start prod 3241
    ;;
  refresh)
    set -e
    cp -r $CO/tests/local/stack/. $S/
    bash $S/up.sh >/dev/null
    cd $CO
    # packages: again only when package-lock.json changed
    sum=$(sha256sum package-lock.json | cut -c1-16)
    if [ "$(cat node_modules/.lock-sum 2>/dev/null)" != "$sum" ]; then
      echo "Installing packages (npm ci)..."
      npm ci --no-audit --no-fund --loglevel=error
      echo "$sum" > node_modules/.lock-sum
    fi
    echo "A fresh database: the baseline, then every migration in supabase/migrations..."
    bash $S/apply_repo.sh $CO | tail -1
    envs
    for p in bf. dk.; do node $S/tools/seed.mjs --prefix $p --quiet >/dev/null; done
    echo "Building the site (a production build with the test switches, as the cloud tests use)..."
    bash $B/server.sh stop 3241 >/dev/null 2>&1 || true
    bash $B/server.sh build > /tmp/local-build.log 2>&1 || { tail -40 /tmp/local-build.log; echo "The build failed: see above."; exit 1; }
    bash $B/server.sh start prod 3241
    node $CO/tests/local/demo-desk.mjs
    echo "The copy is up: http://localhost:3241"
    ;;
  test)
    cd $CO
    envs
    for p in bf. dk.; do node $S/tools/seed.mjs --prefix $p --quiet >/dev/null; done
    if [ $# -gt 0 ]; then
      scripts=()
      for n in "$@"; do for f in $B/$(printf '%02d' "$((10#$n))")-*.mjs; do [ -f "$f" ] && scripts+=("$(basename "$f")"); done; done
    else
      # 14-fixes-fixer1-db was a one-off check for the 31 Oct release: it needs files from the cloud sandbox outside the
      # repo, and its list of migrations stops at that release
      scripts=($(cd $B && ls [0-9][0-9]-*.mjs | sort | grep -v '^14-fixes-fixer1-db\.mjs$'))
      echo "(skipping 14-fixes-fixer1-db: a one-off check from the 31 Oct release)"
    fi
    pass=0; fail=0; failed=()
    tomorrow=$(date -u -d tomorrow +%Y-%m-%d)
    # some scripts want the server started with a setting of their own: restart it only when that changes
    current=""
    serve_with() {
      [ "$1" = "$current" ] && return
      bash $B/server.sh stop 3241 >/dev/null 2>&1
      env $1 bash $B/server.sh start prod 3241 >/dev/null
      current=$1
    }
    for s in "${scripts[@]}"; do
      extra=()
      case "$s" in
        # the photo gate's tests want members made today to count as before the gate
        06-*|12-*) serve_with "MEMBERS_PHOTO_GATE_SINCE=$tomorrow" ;;
        # the card swipe needs the example partners shown
        18-*) serve_with "MEMBERS_SHOW_EXAMPLE_PARTNERS=on" ;;
        # push starts its own server, on 3243
        19-*) extra=(env PHASE_B_BASE=http://localhost:3243) ;;
        *) serve_with "MEMBERS_TEST_COPY=1" ;;
      esac
      start=$(date +%s)
      out=$("${extra[@]}" timeout 900 node $B/$s 2>&1); code=$?
      checks=$(echo "$out" | grep -oE 'PASS [^:]+: [0-9]+ checks' | grep -oE '[0-9]+ checks')
      if [ $code -eq 0 ] && echo "$out" | grep -q '^PASS '; then
        pass=$((pass + 1)); echo "PASS $s (${checks:-?}, $(( $(date +%s) - start ))s)"
      else
        fail=$((fail + 1)); failed+=("$s"); echo "FAIL $s"; echo "$out" | grep -E '^FAIL|Error' | head -5 | sed 's/^/     /'
      fi
    done
    serve_with "MEMBERS_TEST_COPY=1"
    echo
    echo "$pass passed, $fail failed${failed[*]:+: ${failed[*]}}"
    [ $fail -eq 0 ]
    ;;
  code)
    p=${1:-bf.}
    node -e "
      const fs = require('fs');
      const { secret } = JSON.parse(fs.readFileSync('$S/tools/admin-$p' + 'json', 'utf8'));
      import('$S/tools/totp.mjs').then(({ totp, secondsLeft }) => console.log(totp(secret) + '  (good for ' + secondsLeft() + ' more seconds)'));
    "
    ;;
  login)
    cat <<EOF
The local test copy (made-up data only; nothing here is the live site):
  http://localhost:3241/admin/login
  Albert (AC, the owner):  bf.admin@example.com
  Kira (KW, on the desk):  dk.admin@example.com
  Password for both:       local-admin-password-1   (a test-only password, only on this copy)
  The authenticator code:  tests/local/local-test.sh code      (Kira's: tests/local/local-test.sh code dk.)
EOF
    ;;
  *)
    sed -n '2,13p' "$0"
    ;;
esac
