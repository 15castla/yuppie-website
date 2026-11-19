#!/bin/bash
# The local test copy's stack, set up from nothing inside its container (tests/local/README.md): the same mini
# Supabase the cloud tests use (Postgres 16 on 54322, Supabase Auth on 9999, PostgREST on 3000, the gateway on 54321,
# an SMTP catcher on 2500) and the fakes for Stripe, Resend, Twilio and Anthropic on 443. Test-only values: a JWT
# secret made here, keys signed with it, made-up service keys. Nothing here reaches the live site or any real service.
#   bash /home/claude/stack/setup.sh        (once; re-running it starts again from an empty database)
set -euo pipefail
S=/home/claude/stack
cd "$S"
mkdir -p run logs pglog storage certs mail/box/tmp mail/box/new mail/box/cur
chown postgres pglog

# 1. secrets (local only): the JWT secret, the keys signed with it, the fakes' webhook secret
if [ ! -f secrets.env ]; then
  JWT=$(openssl rand -hex 32)
  ANON=$(JWT_SECRET=$JWT node mkjwt.mjs anon)
  SERVICE=$(JWT_SECRET=$JWT node mkjwt.mjs service_role)
  cat > secrets.env <<EOF
JWT_SECRET=$JWT
PG_PASSWORD=localpw
ANON_KEY=$ANON
SERVICE_KEY=$SERVICE
STRIPE_WEBHOOK_SECRET=whsec_local_test_secret
GATEWAY_HOST=0.0.0.0
EOF
fi
set -a; . ./secrets.env; set +a
cat > app.env <<EOF
# Local test env for the Next app against the local stack (test-only values, no real secrets)
export NEXT_TELEMETRY_DISABLED=1
export NODE_EXTRA_CA_CERTS=$S/certs/ca.crt
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
export SUPABASE_SECRET_KEY=$SERVICE_KEY
export STRIPE_SECRET_KEY=sk_test_local_fake
export STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET
export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_local_fake
export STRIPE_PRICE_ID_MEMBERSHIP=price_membership
export RESEND_API_KEY=re_local_fake
export TWILIO_ACCOUNT_SID=AClocalfake
export TWILIO_API_KEY_SID=SKlocalfake
export TWILIO_API_KEY_SECRET=localfake
export TWILIO_MESSAGING_SERVICE_SID=MGlocalfake
export TWILIO_PHONE_NUMBER=+447700900000
export CRON_SECRET=local-cron-secret
export NEXT_PUBLIC_SITE_URL=http://localhost:3101
EOF

# 2. a test certificate authority, and certificates for the fakes (api.stripe.com and the rest point here in
#    /etc/hosts inside the container only) and the fake Apple push service; the push tests' signing key
if [ ! -f certs/ca.crt ]; then
  cd certs
  openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 3650 -subj "/CN=Club Yuppie local test CA" 2>/dev/null
  printf 'subjectAltName=DNS:api.stripe.com,DNS:api.resend.com,DNS:api.twilio.com,DNS:fake-anthropic.test\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n' > ext.cnf
  printf 'subjectAltName=DNS:fake-apns.test\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n' > apns-ext.cnf
  openssl req -newkey rsa:2048 -nodes -keyout fakes.key -out fakes.csr -subj "/CN=api.stripe.com" 2>/dev/null
  openssl x509 -req -in fakes.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out fakes.crt -days 3650 -extfile ext.cnf 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -keyout fake-apns.key -out fake-apns.csr -subj "/CN=fake-apns.test" 2>/dev/null
  openssl x509 -req -in fake-apns.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out fake-apns.crt -days 3650 -extfile apns-ext.cnf 2>/dev/null
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out apns-test-p8.pem 2>/dev/null
  openssl pkcs8 -topk8 -nocrypt -in apns-test-p8.pem -out apns-test.p8
  openssl pkey -in apns-test-p8.pem -pubout -out apns-test.pub 2>/dev/null
  cd "$S"
fi

# 3. the photo over the size limit (11 MB): a real photo, padded
if [ ! -f tools/fixtures/photo-11mb.jpg ]; then
  cp tools/fixtures/photo-800.jpg tools/fixtures/photo-11mb.jpg
  head -c 11500000 /dev/zero >> tools/fixtures/photo-11mb.jpg
fi

# 4. Postgres from nothing (trust on the container's own loopback only), then the roles and schemas Supabase has
bash stop.sh >/dev/null 2>&1 || true
rm -rf pg && install -d -o postgres -m 700 pg
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $S/pg -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $S/pg -o '-p 54322 -k /tmp' -l $S/pglog/pg.log -w start" >/dev/null
P="psql -h 127.0.0.1 -p 54322 -U postgres -q -v ON_ERROR_STOP=1"
$P -f init.sql
# Supabase Auth makes its own tables (its migrations come with it)
(cd bin && env GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:localpw@127.0.0.1:54322/postgres?sslmode=disable" GOTRUE_DB_NAMESPACE=auth \
  GOTRUE_DB_MIGRATIONS_PATH="$S/bin/migrations" GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_SITE_URL=http://localhost:3101 API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
  ./auth migrate) > logs/auth-migrate.log 2>&1 || { echo "Supabase Auth's migrations failed: see $S/logs/auth-migrate.log"; exit 1; }
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $S/pg -m fast stop" >/dev/null

# 5. the rest of the stack, and the fakes' names
bash up.sh
echo "stack ready"
