# The local test copy's machine (Albert, 19 Nov 2026: "from now on we need to test locally prior to pushing"; he chose
# "A test copy on your Mac"). An Ubuntu 24.04 box with what the cloud tests run on: Postgres 16, Supabase Auth and
# PostgREST (the versions the cloud stack uses), Node 22, Python with aiosmtpd (the email catcher) and Chromium for
# Playwright. The stack's own scripts and the code come in from the repo (tests/local/local-test.sh); nothing here
# holds a secret or talks to a live service. Built by tests/local/local-test.sh; see tests/local/README.md.
FROM ubuntu:24.04

ARG TARGETARCH
ARG NODE_VERSION=22.22.0
ARG AUTH_VERSION=2.177.0
ARG POSTGREST_VERSION=12.2.3
ARG PLAYWRIGHT_VERSION=1.63.0
ARG SUPABASE_JS_VERSION=2.112.3
ENV DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC LANG=C.UTF-8

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils openssl git procps util-linux tzdata \
      postgresql-16 postgresql-client-16 python3 python3-pip \
 && rm -rf /var/lib/apt/lists/*

# Node 22 (the official build for this machine's chip)
RUN arch=$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x64) \
 && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz" | tar -xJ -C /usr/local --strip-components=1 \
 && node --version

# Supabase Auth (with its migrations) and PostgREST, as in the cloud stack
RUN mkdir -p /home/claude/stack/bin && cd /home/claude/stack/bin \
 && a=$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x86) \
 && curl -fsSL "https://github.com/supabase/auth/releases/download/v${AUTH_VERSION}/auth-v${AUTH_VERSION}-${a}.tar.gz" | tar -xz \
 && p=$([ "$TARGETARCH" = "arm64" ] && echo ubuntu-aarch64 || echo linux-static-x64) \
 && curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-${p}.tar.xz" | tar -xJ \
 && ls -la /home/claude/stack/bin && ./postgrest --version && test -d migrations

# the email catcher
RUN pip3 install --break-system-packages --no-cache-dir aiosmtpd==1.4.6

# the test tools' own packages, and Chromium for Playwright (with the libraries it needs)
RUN cd /home/claude/stack \
 && npm install --no-audit --no-fund --no-save "playwright@${PLAYWRIGHT_VERSION}" "@supabase/supabase-js@${SUPABASE_JS_VERSION}" \
 && npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/claude/co
WORKDIR /home/claude/co
CMD ["sleep", "infinity"]
