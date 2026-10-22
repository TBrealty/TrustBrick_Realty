#!/usr/bin/env bash
# Puts the latest code live (deploy/README.md). Run on the server from the repository:
#   bash deploy/deploy.sh
# It pulls the code, builds the images, updates the database (migrations and the reference data
# that keeps roles and permissions in step with the code), then restarts what changed.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "✗ deploy/.env is missing. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

echo "▸ Getting the latest code"
git -C .. pull --ff-only

echo "▸ Building (a few minutes)"
docker compose build app tools stitcher

echo "▸ Updating the database"
docker compose run --rm tools npm run db:migrate
docker compose run --rm tools npm run db:seed:reference

echo "▸ Starting the site"
docker compose up -d --remove-orphans caddy app stitcher

echo "▸ Clearing old images"
docker image prune -f >/dev/null

# Wait for the site to answer.
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "✓ Deployed. The site is live."
    exit 0
  fi
  sleep 2
done
echo "✗ The site didn't answer. Check: docker compose logs --tail=100 app" >&2
exit 1
