#!/usr/bin/env bash
# Back up the SAS database and uploaded media.
#
# Install:
#   sudo install -m 755 deploy/backup.sh /usr/local/bin/sas-backup
#   sudo mkdir -p /var/backups/sas
#   sudo crontab -e
#     15 3 * * * APP_DIR=/var/www/sas /usr/local/bin/sas-backup >> /var/log/sas-backup.log 2>&1
#
# Restore:
#   sudo systemctl stop sas-wedding
#   sudo tar -xzf /var/backups/sas/sas-data-YYYYMMDD-HHMMSS.tar.gz -C /var/www/sas
#   sudo chown -R sas:sas /var/www/sas/data
#   sudo systemctl start sas-wedding

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/sas}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/sas}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_DIR/sas-data-$STAMP.tar.gz"

if [ ! -d "$APP_DIR/data" ]; then
    echo "No data directory at $APP_DIR/data" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
tar -czf "$ARCHIVE" -C "$APP_DIR" data

# Keep 30 days by default.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sas-data-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Backup written: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
