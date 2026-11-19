#!/bin/bash
# Stop the local stack by pid files only (never by pattern)
cd /home/claude/stack
for n in gateway fakes auth postgrest smtp; do [ -f run/$n.pid ] && kill $(cat run/$n.pid) 2>/dev/null; rm -f run/$n.pid; done
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/claude/stack/pg -m fast stop" >/dev/null 2>&1
echo stopped
