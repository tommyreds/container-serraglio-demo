# Messa online su un VPS

Guida per chi mantiene il sito. Tempo: circa mezz'ora la prima volta.

## Cosa serve

- Un VPS con **Debian 12** (es. Hetzner CX22, circa 4 €/mese), intestato al locale.
- Un **dominio** (es. `containerserraglio.it`, circa 10 €/anno), intestato al locale.
- Il codice in un repository git raggiungibile dal server (anche privato, con una deploy key).
- Una chiave SSH sul tuo computer.

## 1. DNS

Nel pannello del dominio crea due record **A** verso l'IP del VPS:
`containerserraglio.it` e `www.containerserraglio.it`. Aspetta che rispondano
(`ping containerserraglio.it`).

## 2. Preparazione del server (una volta)

```bash
ssh root@IP-DEL-VPS
# copia la tua chiave se non c'è già, poi:
apt-get update && apt-get install -y git
git clone https://github.com/<utente>/container-serraglio-vetrina.git /tmp/sito
REPO=https://github.com/<utente>/container-serraglio-vetrina.git bash /tmp/sito/deploy/setup.sh containerserraglio.it
```

Lo script installa Node, Caddy, firewall (solo 22/80/443), fail2ban,
aggiornamenti automatici; crea l'utente `serraglio`, prepara il database e
**stampa il PIN del pannello**: consegnalo al titolare. Se sul server c'è una
chiave SSH disattiva anche l'accesso con password.

Caddy ottiene il certificato HTTPS da solo al primo accesso al dominio.

## 3. Aggiornamenti

Dal tuo computer, dopo aver fatto `git push`:

```bash
bash deploy/update.sh root@IP-DEL-VPS containerserraglio.it
```

Scarica, installa, esegue i test, riavvia e controlla `/salute`. Se qualcosa
non va torna da solo alla versione precedente.

## 4. Copie di sicurezza

Ogni notte alle 3:30 in `/srv/container-serraglio/backup/` (database e foto,
14 giorni). Per tenerne una copia fuori dal server, ogni tanto dal tuo
computer:

```bash
rsync -a root@IP-DEL-VPS:/srv/container-serraglio/backup/ ./backup-serraglio/
```

Ripristino:

```bash
systemctl stop container-serraglio
cp /srv/container-serraglio/backup/db-2026-11-02.db /srv/container-serraglio/dati/container.db
tar -xzf /srv/container-serraglio/backup/foto-2026-11-02.tar.gz -C /srv/container-serraglio/dati
chown -R serraglio:serraglio /srv/container-serraglio/dati
systemctl start container-serraglio
```

## 5. Controllo che sia acceso

Registra `https://containerserraglio.it/salute` su un servizio gratuito
(es. UptimeRobot, ogni 5 minuti): se il sito cade ti arriva una mail prima
che se ne accorga il locale.

## Comandi utili

| Cosa | Comando |
|---|---|
| Stato del sito | `systemctl status container-serraglio` |
| Ultimi messaggi | `journalctl -u container-serraglio -n 50` |
| Riavvio | `systemctl restart container-serraglio` |
| PIN dimenticato | `cd /srv/container-serraglio/app && sudo -u serraglio npm run seed -- --pin=NNNNNN --solo-pin` |
| Registro richieste (IP accorciati, 7 giorni) | `tail /var/log/caddy/serraglio.log` |

## Impostazioni (`/srv/container-serraglio/app/.env`)

| Chiave | Valore |
|---|---|
| `NODE_ENV` | `production` (cookie sicuri, controlli all'avvio) |
| `BASE_URL` | `https://containerserraglio.it` (obbligatorio in produzione) |
| `HOST` / `PORT` | `127.0.0.1` / `3000`: raggiungibile solo da Caddy |
| `TRUST_PROXY` | `loopback`: si crede all'IP che passa Caddy, a nessun altro |
| `DB_PATH`, `FOTO_DIR` | dentro `/srv/container-serraglio/dati` |

Il sito **non parte** se il PIN è ancora il vecchio `246810` o se manca
`BASE_URL` in https: è voluto.
