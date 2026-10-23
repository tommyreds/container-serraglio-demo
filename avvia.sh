#!/usr/bin/env bash
# Avvio del sito su un telefono (Termux, Kali in chroot) o su qualunque Linux.
#
#   ./avvia.sh            rete locale: raggiungibile dall'hotspot del telefono
#   ./avvia.sh --pubblico anche da internet, con un tunnel HTTPS temporaneo
#
# Tutto gira dentro tmux: la sessione sopravvive se chiudi il terminale,
# e si riprende con "tmux attach -t container".
# Il sito rifiuta di partire con il vecchio PIN predefinito: alla prima
# preparazione del database il PIN viene scelto a caso e stampato qui.

set -euo pipefail
cd "$(dirname "$0")"

SESSIONE=container
PORTA="${PORT:-3000}"
PUBBLICO=false
[[ "${1:-}" == "--pubblico" ]] && PUBBLICO=true

# ---------- controlli ----------
command -v node >/dev/null || { echo "Manca node. Installalo e riprova."; exit 1; }
VERSIONE=$(node -p "process.versions.node.split('.').slice(0, 2).join('.')")
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=9)?0:1)" \
  || { echo "Serve Node 22.9 o superiore, qui c'è la $VERSIONE."; exit 1; }
command -v tmux >/dev/null || { echo "Manca tmux:  pkg install tmux  (Termux)  oppure  apt install tmux"; exit 1; }

[[ -d node_modules ]] || { echo "Installo le dipendenze…"; npm install --omit=dev; }
[[ -f .env ]] || cp .env.example .env
[[ -f dati/container.db ]] || { echo "Primo avvio: preparo il database…"; npm run seed --silent; echo "^^^ annota il PIN del pannello"; }

# ---------- la sessione ----------
tmux kill-session -t "$SESSIONE" 2>/dev/null || true
if $PUBBLICO; then
  command -v cloudflared >/dev/null || { echo "Manca cloudflared:  pkg install cloudflared  (Termux)"; exit 1; }
  # col tunnel il sito ascolta solo in locale: da fuori si entra dal tunnel, in https
  tmux new-session -d -s "$SESSIONE" -n server "PORT=$PORTA HOST=127.0.0.1 TUNNEL=1 npm start"
  tmux new-window -t "$SESSIONE" -n tunnel "cloudflared tunnel --no-autoupdate --url http://localhost:$PORTA"
else
  tmux new-session -d -s "$SESSIONE" -n server "PORT=$PORTA HOST=0.0.0.0 npm start"
fi

# Android spegne i processi in secondo piano per risparmiare batteria.
# Il wake lock lo impedisce. Esiste solo con Termux installato.
command -v termux-wake-lock >/dev/null && termux-wake-lock && echo "Wake lock attivo."

if $PUBBLICO; then
  echo
  echo "Tunnel in avvio. L'indirizzo pubblico (https://….trycloudflare.com) compare qui:"
  echo "   tmux attach -t $SESSIONE   poi Ctrl-b 1"
else
  # Termux non ha sempre "ip": si ripiega su ifconfig, poi si rinuncia
  IP=$(ip -4 addr show 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | grep -v '^127\.' | head -1 || true)
  [[ -z "${IP:-}" ]] && IP=$(ifconfig 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | grep -v '^127\.' | head -1 || true)
  echo
  echo "Sito in rete locale:  http://${IP:-indirizzo-del-telefono}:$PORTA"
  echo "Pannello:             http://${IP:-indirizzo-del-telefono}:$PORTA/admin"
fi

echo
echo "Se il sito non parte:  tmux attach -t $SESSIONE   (il motivo è scritto lì)"
echo "Per fermare tutto:     tmux kill-session -t $SESSIONE"
