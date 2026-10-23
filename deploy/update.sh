#!/usr/bin/env bash
# Aggiornamento del sito, dal proprio computer:
#
#   bash deploy/update.sh utente@server containerserraglio.it
#
# Sul server: scarica l'ultima versione, installa, esegue i test, riavvia e
# controlla che il sito risponda. Se qualcosa non va torna alla versione di
# prima da solo, così il locale non resta mai senza sito.

set -euo pipefail
SERVER="${1:?Uso: bash deploy/update.sh utente@server DOMINIO}"
DOMINIO="${2:?Uso: bash deploy/update.sh utente@server DOMINIO}"

ssh "$SERVER" DOMINIO="$DOMINIO" 'bash -s' <<'REMOTO'
set -euo pipefail
APP=/srv/container-serraglio/app
come() { sudo -u serraglio bash -c "cd $APP && $*"; }

PRIMA=$(come git rev-parse HEAD)
echo "Versione attuale: $PRIMA"

ripristina() {
  echo "!! Qualcosa è andato storto: torno a $PRIMA"
  come git reset --hard "$PRIMA"
  come npm ci --omit=dev --no-audit --no-fund
  sudo systemctl restart container-serraglio
  exit 1
}

come git fetch --quiet origin
come git merge --ff-only --quiet '@{u}' || ripristina
DOPO=$(come git rev-parse HEAD)
[[ "$PRIMA" == "$DOPO" ]] && { echo "Già aggiornato."; exit 0; }

come npm ci --omit=dev --no-audit --no-fund || ripristina
come npm test --silent >/tmp/serraglio-test.log 2>&1 || { tail -20 /tmp/serraglio-test.log; ripristina; }
sudo systemctl restart container-serraglio

for i in $(seq 1 10); do
  if curl -fsS "https://$DOMINIO/salute" >/dev/null; then
    echo "Aggiornato a $DOPO e il sito risponde."
    exit 0
  fi
  sleep 2
done
ripristina
REMOTO
