#!/usr/bin/env bash
# Preparazione di un VPS Debian 12, una volta sola.
#
#   sudo REPO=https://github.com/<utente>/container-serraglio-vetrina.git \
#        bash deploy/setup.sh containerserraglio.it
#
# Installa Node LTS, Caddy (HTTPS automatico), firewall, fail2ban e
# aggiornamenti di sicurezza automatici; crea l'utente "serraglio", scarica
# il sito, prepara il database e avvia tutto con systemd.
# SENZA_SYSTEMD=1 salta systemd e firewall (prova dentro un container).

set -euo pipefail

DOMINIO="${1:?Uso: sudo bash deploy/setup.sh DOMINIO   (es. containerserraglio.it)}"
REPO="${REPO:-}"
BASE=/srv/container-serraglio
APP="$BASE/app"
UTENTE=serraglio
SENZA_SYSTEMD="${SENZA_SYSTEMD:-0}"

[[ $EUID -eq 0 ]] || { echo "Va eseguito come root (sudo)."; exit 1; }
passo() { printf '\n==> %s\n' "$*"; }

passo "Pacchetti di base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q curl git sqlite3 ca-certificates gnupg debian-keyring debian-archive-keyring \
  apt-transport-https build-essential python3 ufw fail2ban unattended-upgrades sudo

passo "Node.js LTS (NodeSource)"
if ! command -v node >/dev/null || (( $(node -p "process.versions.node.split('.')[0]") < 22 )); then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
node -v

passo "Caddy (repository ufficiale)"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

passo "Utente e cartelle"
id "$UTENTE" >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin "$UTENTE"
mkdir -p "$BASE/dati/foto" "$BASE/backup"

passo "Codice del sito"
if [[ ! -d "$APP/.git" ]]; then
  if [[ -n "$REPO" ]]; then
    git clone --depth 50 "$REPO" "$APP"
  elif [[ -f "$(dirname "$0")/../package.json" ]]; then
    cp -r "$(cd "$(dirname "$0")/.." && pwd)" "$APP"   # copiato a mano sul server
  else
    echo "Indica REPO=... oppure esegui lo script dalla cartella del sito."; exit 1
  fi
fi
chown -R "$UTENTE:$UTENTE" "$BASE"
sudo -u "$UTENTE" bash -c "cd '$APP' && npm ci --omit=dev --no-audit --no-fund"

passo "Impostazioni (.env)"
if [[ ! -f "$APP/.env" ]]; then
  cat > "$APP/.env" <<EOF
NODE_ENV=production
BASE_URL=https://$DOMINIO
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=loopback
DB_PATH=$BASE/dati/container.db
FOTO_DIR=$BASE/dati/foto
EOF
  chown "$UTENTE:$UTENTE" "$APP/.env"
  chmod 600 "$APP/.env"
fi

passo "Database"
if [[ ! -f "$BASE/dati/container.db" ]]; then
  sudo -u "$UTENTE" bash -c "cd '$APP' && npm run seed --silent"
  echo "^^^ Scrivi il PIN del pannello qui sopra: serve al locale per entrare."
fi

passo "Caddy: HTTPS per $DOMINIO"
sed "s/{\$DOMINIO}/$DOMINIO/g" "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy 2>/dev/null || true

if [[ "$SENZA_SYSTEMD" == "1" ]]; then
  passo "SENZA_SYSTEMD=1: salto systemd, firewall e SSH"
  exit 0
fi

passo "Servizi systemd (sito e copia di sicurezza giornaliera)"
install -m 644 "$APP/deploy/container-serraglio.service" /etc/systemd/system/
install -m 644 "$APP/deploy/container-serraglio-backup.service" /etc/systemd/system/
install -m 644 "$APP/deploy/container-serraglio-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now container-serraglio container-serraglio-backup.timer
systemctl reload caddy || systemctl restart caddy

passo "Firewall: solo SSH, HTTP e HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

passo "fail2ban e aggiornamenti automatici"
systemctl enable --now fail2ban
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades

passo "SSH solo con chiave"
if compgen -G "/root/.ssh/authorized_keys" >/dev/null || compgen -G "/home/*/.ssh/authorized_keys" >/dev/null; then
  printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-serraglio.conf
  systemctl reload ssh || systemctl reload sshd || true
  echo "Accesso SSH con password disattivato."
else
  echo "ATTENZIONE: nessuna chiave SSH trovata, l'accesso con password resta attivo. Aggiungi una chiave e rilancia."
fi

passo "Fatto"
sleep 2
curl -fsS "http://127.0.0.1:3000/salute" && echo
echo "Sito: https://$DOMINIO   ·   Pannello: https://$DOMINIO/admin"
echo "Il DNS di $DOMINIO (e www.$DOMINIO) deve puntare a questo server: Caddy chiede il certificato da solo."
