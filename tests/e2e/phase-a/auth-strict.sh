#!/bin/bash
# A second local Auth server (same binary, same database, same JWT secret as /home/claude/stack/start.sh) on port 9998
# with a strict verify rate limit, so 10-member-flows.mjs can get Auth's real "too many tries" answer
# (429 over_request_rate_limit) for the login page. The shared Auth server on 9999 keeps its loose limits.
#   tests/e2e/phase-a/auth-strict.sh start | stop      (stopped by PID; never pkill)
set -e
PIDFILE=/tmp/phase-a-auth-strict.pid
if [ "$1" = stop ]; then
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then kill "$(cat "$PIDFILE")"; echo "stopped $(cat "$PIDFILE")"; fi
  rm -f "$PIDFILE"; exit 0
fi
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then echo "already up (pid $(cat "$PIDFILE"))"; exit 0; fi
cd /home/claude/stack; set -a; . ./secrets.env; set +a
env GOTRUE_API_HOST=127.0.0.1 PORT=9998 API_EXTERNAL_URL=http://127.0.0.1:9998 \
  GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:localpw@127.0.0.1:54322/postgres?sslmode=disable" GOTRUE_DB_NAMESPACE=auth \
  GOTRUE_SITE_URL=http://localhost:3101 GOTRUE_URI_ALLOW_LIST="http://localhost:3101/**" \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false GOTRUE_MAILER_OTP_EXP=600 GOTRUE_MAILER_OTP_LENGTH=6 \
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_USER=x GOTRUE_SMTP_PASS=x GOTRUE_SMTP_ADMIN_EMAIL=noreply@clubyuppie.com GOTRUE_SMTP_SENDER_NAME="Club Yuppie" GOTRUE_SMTP_MAX_FREQUENCY=1s \
  GOTRUE_RATE_LIMIT_EMAIL_SENT=100000 GOTRUE_RATE_LIMIT_VERIFY=1 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=100000 GOTRUE_RATE_LIMIT_OTP=100000 \
  GOTRUE_RATE_LIMIT_HEADER=X-Test-Client GOTRUE_LOG_LEVEL=warn \
  nohup /home/claude/stack/bin/auth > /tmp/phase-a-auth-strict.log 2>&1 &
echo $! > "$PIDFILE"
for i in $(seq 1 30); do
  if curl -s --noproxy '*' -o /dev/null http://127.0.0.1:9998/health; then echo "up on 9998 (pid $(cat "$PIDFILE"))"; exit 0; fi
  sleep 0.5
done
echo "did not start; see /tmp/phase-a-auth-strict.log"; exit 1
