#!/bin/bash
# Local mini-Supabase: Postgres 16 :54322, Auth :9999, PostgREST :3000, gateway :54321, SMTP catcher :2500
cd /home/claude/stack; set -a; . ./secrets.env; set +a
mkdir -p run mail/box/tmp mail/box/new mail/box/cur
alive() { [ -f run/$1.pid ] && kill -0 $(cat run/$1.pid) 2>/dev/null; }
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/claude/stack/pg status" >/dev/null 2>&1 || su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/claude/stack/pg -o '-p 54322 -k /tmp' -l /home/claude/stack/pglog/pg.log -w start" >/dev/null
alive smtp || { nohup python3 -m aiosmtpd -n -l 127.0.0.1:2500 -c aiosmtpd.handlers.Mailbox /home/claude/stack/mail/box > logs/smtp.log 2>&1 & echo $! > run/smtp.pid; }
alive auth || { env GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
  GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:localpw@127.0.0.1:54322/postgres?sslmode=disable" GOTRUE_DB_NAMESPACE=auth \
  GOTRUE_SITE_URL=http://localhost:3101 GOTRUE_URI_ALLOW_LIST="http://localhost:3101/**" \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false GOTRUE_MAILER_OTP_EXP=600 GOTRUE_MAILER_OTP_LENGTH=6 \
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_USER=x GOTRUE_SMTP_PASS=x GOTRUE_SMTP_ADMIN_EMAIL=noreply@clubyuppie.com GOTRUE_SMTP_SENDER_NAME="Club Yuppie" GOTRUE_SMTP_MAX_FREQUENCY=1s \
  GOTRUE_RATE_LIMIT_EMAIL_SENT=100000 GOTRUE_RATE_LIMIT_VERIFY=100000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=100000 GOTRUE_RATE_LIMIT_OTP=100000 \
  GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://127.0.0.1:54321/templates/magic_link.html GOTRUE_MAILER_TEMPLATES_RECOVERY=http://127.0.0.1:54321/templates/recovery.html GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://127.0.0.1:54321/templates/confirmation.html GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=http://127.0.0.1:54321/templates/email_change.html GOTRUE_MAILER_TEMPLATES_INVITE=http://127.0.0.1:54321/templates/invite.html GOTRUE_MAILER_TEMPLATES_REAUTHENTICATION=http://127.0.0.1:54321/templates/reauthentication.html GOTRUE_MFA_TOTP_ENROLL_ENABLED=true GOTRUE_MFA_TOTP_VERIFY_ENABLED=true GOTRUE_MFA_MAX_ENROLLED_FACTORS=10 GOTRUE_LOG_LEVEL=info \
  nohup /home/claude/stack/bin/auth > logs/auth.log 2>&1 & echo $! > run/auth.pid; }
alive postgrest || { env PGRST_DB_URI="postgres://authenticator:localpw@127.0.0.1:54322/postgres" PGRST_DB_SCHEMAS="public,storage,graphql_public" \
  PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" PGRST_SERVER_PORT=3000 PGRST_DB_EXTRA_SEARCH_PATH="public,extensions" PGRST_DB_MAX_ROWS=1000 \
  nohup /home/claude/stack/bin/postgrest > logs/postgrest.log 2>&1 & echo $! > run/postgrest.pid; }
alive gateway || { nohup node /home/claude/stack/gateway.mjs > logs/gateway.log 2>&1 & echo $! > run/gateway.pid; }
alive fakes || { nohup node /home/claude/stack/fakes.mjs > logs/fakes.out 2>&1 & echo $! > run/fakes.pid; }
sleep 2; echo started
