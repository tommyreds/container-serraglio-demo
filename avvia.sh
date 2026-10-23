#!/usr/bin/env bash
# Avvio del sito su un telefono (Kali in chroot, Termux, o qualunque Linux).
#
#   ./avvia.sh            solo rete locale: raggiungibile dall'hotspot
#   ./avvia.sh --pubblico anche da fuori, con un tunnel HTTPS temporaneo
#
# Tutto gira dentro tmux: la sessione sopravvive se chiudi il terminale,
# e si riprende con "tmux attach -t container".

set -euo pipefail
cd "$(dirname "$0")"

SESSIONE=container
PORTA="${PORT:-3000}"
PUBBLICO=false
[[ "${1:-}" == "--pubblico" ]] && PUBBLICO=true

# ---------- controlli ----------
command -v node >/dev/null || { echo "Manca node. Installalo e riprova."; exit 1; }
VERSIONE=$(node -p "process.versions.node.split('.')[0]")
(( VERSIONE >= 20 )) || { echo "Serve Node 20 o superiore, qui c'è la $VERSIONE."; exit 1; }
command -v tmux >/dev/null || { echo "Manca tmux:  pkg install tmux  (Termux)  oppure  apt install tmux"; exit 1; }

[[ -d node_modules ]] || { echo "Installo le dipendenze…"; npm install; }
[[ -f .env ]] || { cp .env.example .env; echo "Creato .env — cambia ADMIN_PIN."; }
[[ -f dati/container.db ]] || { echo "Primo avvio: preparo il database…"; npm run seed; }

# ---------- la sessione ----------
tmux kill-session -t "$SESSIONE" 2>/dev/null || true
tmux new-session -d -s "$SESSIONE" -n server "npm start"

# Android spegne i processi in secondo piano per risparmiare batteria.
# Il wake lock lo impedisce. Esiste solo con Termux installato.
command -v termux-wake-lock >/dev/null && termux-wake-lock && echo "Wake lock attivo."

# ---------- indirizzo in rete locale ----------
# Termux non ha sempre "ip": si ripiega su ifconfig, poi si rinuncia
IP=$(ip -4 addr show 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | grep -v '^127\.' | head -1)
[[ -z "${IP:-}" ]] && IP=$(ifconfig 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | grep -v '^127\.' | head -1)
echo
echo "Sito in rete locale:  http://${IP:-indirizzo-del-telefono}:$PORTA"
echo "Pannello:             http://${IP:-indirizzo-del-telefono}:$PORTA/admin"

# ---------- tunnel pubblico ----------
if $PUBBLICO; then
  command -v cloudflared >/dev/null || { echo "Manca cloudflared:  pkg install cloudflared  (Termux). Vedi il README."; exit 1; }
  tmux new-window -t "$SESSIONE" -n tunnel "cloudflared tunnel --url http://localhost:$PORTA"
  echo
  echo "Tunnel in avvio. L'indirizzo pubblico compare qui:"
  echo "   tmux attach -t $SESSIONE   poi Ctrl-b 1"
  echo
  echo "Nota: con il tunnel il sito è in HTTPS. Se metti NODE_ENV=production"
  echo "nel .env il pannello funziona SOLO dal tunnel, non più da http locale."
fi

echo
echo "Per fermare tutto:  tmux kill-session -t $SESSIONE"
