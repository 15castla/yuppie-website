#!/bin/bash
# Rebuild public schema: baseline + every repo migration in order (+ optional extra dir)
set -e
REPO=${1:-/home/claude/co}
P="psql -h 127.0.0.1 -p 54322 -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop schema public cascade; create schema public; grant usage, create on schema public to anon, authenticated, service_role; grant all on schema public to postgres;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
delete from storage.objects; delete from storage.buckets;"
$P -f /home/claude/stack/baseline.sql
for f in $(ls $REPO/supabase/migrations/*.sql | sort); do echo "-> $(basename $f)"; $P -f $f; done
$P -c "notify pgrst, 'reload schema'"
echo APPLIED
