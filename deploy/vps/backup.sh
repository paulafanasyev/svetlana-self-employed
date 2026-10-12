#!/usr/bin/env bash
# Ежедневная копия базы (systemd-таймер svetlana-backup.timer). Хранится 14 дней.
# Копия вне сервера: если настроен rclone (rclone config) и задан BACKUP_REMOTE
# в /etc/svetlana/backup.env (например BACKUP_REMOTE=s3ru:mir-backups), копия уходит туда же.
set -euo pipefail
DB=/var/lib/svetlana/data/app.sqlite
DIR=/var/lib/svetlana/backups
[ -f /etc/svetlana/backup.env ] && . /etc/svetlana/backup.env
[ -f "$DB" ] || { echo "База ещё не создана"; exit 0; }
OUT="$DIR/app-$(date +%F-%H%M).sqlite"
sqlite3 "$DB" ".backup '$OUT'"
sqlite3 "$OUT" 'PRAGMA integrity_check;' | grep -qx ok || { echo "!! копия повреждена"; rm -f "$OUT"; exit 1; }
gzip -f "$OUT"
tar -czf "$DIR/storage-$(date +%F).tar.gz" -C /var/lib/svetlana storage 2>/dev/null || true
find "$DIR" -type f -mtime +14 -delete
if [ -n "${BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$DIR" "$BACKUP_REMOTE" --max-age 25h
fi
echo "Копия: $OUT.gz"
