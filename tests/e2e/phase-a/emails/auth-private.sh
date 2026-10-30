#!/bin/bash
# A private Supabase Auth on :9998 whose email templates come from THIS
# worktree's supabase/templates/ (served on :54399), with the subjects of
# supabase/config.toml. Same database and SMTP catcher as the local stack
# (/home/claude/stack/start.sh must be running). Its settings are taken from
# start.sh's own Auth line, with only the port and template URLs changed;
# nothing is printed.
#
#   tests/e2e/phase-a/emails/auth-private.sh start
#   source /home/claude/stack/app.env && node tests/e2e/phase-a/emails/auth-templates-live.mjs http://127.0.0.1:9998
#   tests/e2e/phase-a/emails/auth-private.sh stop
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
RUN="${TMPDIR:-/tmp}/emails-auth-private"
mkdir -p "$RUN"
case "${1:-}" in
  start)
    python3 - "$RUN/auth.sh" <<'EOF'
import sys
s = open('/home/claude/stack/start.sh').read()
block = s[s.index('alive auth || { env ') + len('alive auth || { '): s.index('nohup /home/claude/stack/bin/auth')]
block = block.replace('PORT=9999', 'PORT=9998').replace('API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1', 'API_EXTERNAL_URL=http://127.0.0.1:9998')
block = block.replace('http://127.0.0.1:54321/templates/', 'http://127.0.0.1:54399/').rstrip().rstrip('\\').rstrip()
subjects = (' GOTRUE_MAILER_SUBJECTS_MAGIC_LINK="Your Club Yuppie login code"'
            ' GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE="Confirm your new Club Yuppie email"'
            ' GOTRUE_MAILER_SUBJECTS_RECOVERY="Reset your Club Yuppie admin password"')
open(sys.argv[1], 'w').write("#!/bin/bash\ncd /home/claude/stack; set -a; . ./secrets.env; set +a\nexec " + block + subjects + " /home/claude/stack/bin/auth\n")
EOF
    chmod 700 "$RUN/auth.sh"
    nohup python3 -m http.server 54399 --bind 127.0.0.1 --directory "$REPO/supabase/templates" > "$RUN/templates.log" 2>&1 &
    echo $! > "$RUN/templates.pid"
    nohup "$RUN/auth.sh" > "$RUN/auth.log" 2>&1 &
    echo $! > "$RUN/auth.pid"
    sleep 4
    curl -s --noproxy '*' http://127.0.0.1:9998/health && echo
    ;;
  stop)
    for p in auth templates; do [ -f "$RUN/$p.pid" ] && kill "$(cat "$RUN/$p.pid")" 2>/dev/null || true; rm -f "$RUN/$p.pid"; done
    echo stopped
    ;;
  *) echo "usage: $0 start|stop"; exit 1 ;;
esac
