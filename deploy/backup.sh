#!/usr/bin/env bash
# Copia di sicurezza del database e delle foto, una al giorno (timer systemd).
# Tiene gli ultimi 14 giorni. Per una copia fuori dal server, dal proprio
# computer:  rsync -a utente@server:/srv/container-serraglio/backup/ ./backup-serraglio/

set -euo pipefail
BASE="${BASE:-/srv/container-serraglio}"
DESTINAZIONE="$BASE/backup"
OGGI="$(date +%F)"
mkdir -p "$DESTINAZIONE"

# .backup copia il database in modo coerente anche mentre il sito lo usa
sqlite3 "$BASE/dati/container.db" ".backup '$DESTINAZIONE/db-$OGGI.db'"
tar -czf "$DESTINAZIONE/foto-$OGGI.tar.gz" -C "$BASE/dati" foto

find "$DESTINAZIONE" -type f \( -name 'db-*.db' -o -name 'foto-*.tar.gz' \) -mtime +14 -delete
echo "Copia del $OGGI fatta in $DESTINAZIONE"
