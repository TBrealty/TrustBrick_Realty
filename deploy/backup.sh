#!/usr/bin/env bash
# Nightly database backup to S3 (deploy/crontab runs it). Keeps the last 7 on the server too.
# Restore: deploy/README.md → "Backups".
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a

mkdir -p backups
file="backups/trustbrick-$(date -u +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T postgres pg_dump -U postgres -d trustbrick --no-owner | gzip > "$file"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  # The AWS command-line tool, in a container, using the server's IAM role.
  docker run --rm -v "$PWD/backups:/backups:ro" amazon/aws-cli s3 cp "/$file" "s3://$BACKUP_S3_BUCKET/db-backups/$(basename "$file")" --only-show-errors
fi

ls -1t backups/*.sql.gz | tail -n +8 | xargs -r rm --
echo "✓ Backed up $(basename "$file")"
