#!/usr/bin/env bash
# One-command local run for the streak-reward-api.
#
#   npm start
#
# Installs dependencies (if missing), bootstraps a working local .env (if
# missing), starts PostgreSQL + Redis via Docker Compose (or reuses services
# that are already reachable), applies migrations, and runs the API.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> streak-reward-api — one-command setup & run"

# 1. Dependencies
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies (npm install)..."
  npm install
else
  echo "==> node_modules present, skipping install"
fi

# 2. Environment bootstrap — never overwrite existing values.
#    Existing exported env vars (DATABASE_URL, REDIS_URL, PORT, JWT_SECRET)
#    take precedence, then an existing .env, then local dev defaults.
gen_secret() {
  openssl rand -hex 32 2>/dev/null || od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}
if [ ! -f .env ]; then
  cat > .env <<EOF
PORT=${PORT:-3000}
DATABASE_URL="${DATABASE_URL:-postgresql://streak:streak@localhost:5432/streak_rewards?schema=public}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
JWT_SECRET=${JWT_SECRET:-$(gen_secret)}
JWT_EXPIRES_IN=7d
SCHEDULER_TIMEZONE=Asia/Kolkata
SCHEDULER_ENABLED=true
EOF
  echo "==> Created .env with local dev defaults"
else
  echo "==> .env found, keeping it"
  # A .env copied verbatim from .env.example has empty values — fill the ones
  # that would otherwise crash the app (the file is gitignored, safe to touch).
  if grep -q '^DATABASE_URL=$' .env; then
    sed -i "s|^DATABASE_URL=\$|DATABASE_URL=\"${DATABASE_URL:-postgresql://streak:streak@localhost:5432/streak_rewards?schema=public}\"|" .env
    echo "==> Filled empty DATABASE_URL with dev default"
  fi
  if grep -q '^REDIS_URL=$' .env; then
    sed -i "s|^REDIS_URL=\$|REDIS_URL=\"${REDIS_URL:-redis://localhost:6379}\"|" .env
    echo "==> Filled empty REDIS_URL with dev default"
  fi
  if grep -q '^JWT_SECRET=$' .env; then
    sed -i "s|^JWT_SECRET=\$|JWT_SECRET=$(gen_secret)|" .env
    echo "==> Generated JWT_SECRET"
  fi
fi

# 3. Infrastructure — Docker Compose, or reuse already-reachable services.
db_host=$(sed -n 's|^DATABASE_URL="\?postgresql://[^@]*@\([^:/]*\):\([0-9]*\).*|\1:\2|p' .env | head -1)
redis_host=$(sed -n 's|^REDIS_URL="\?redis://\([^/]*\).*|\1|p' .env | head -1)
reachable() {
  local host=${1%:*} port=${1#*:}
  (exec 3<>"/dev/tcp/$host/$port") 2>/dev/null
}
if [ -n "$db_host" ] && [ -n "$redis_host" ] && reachable "$db_host" && reachable "$redis_host"; then
  echo "==> Postgres ($db_host) and Redis ($redis_host) already reachable — skipping docker compose"
else
  echo "==> Starting PostgreSQL + Redis via docker compose..."
  docker compose up -d
fi

# 4. Migrations
echo "==> Applying migrations..."
npx prisma migrate deploy

# 5. Run
echo "==> Starting API (http://localhost:${PORT:-3000})"
exec npm run dev
