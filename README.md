# Container Serraglio — sito e pannello

Sito del container di street food davanti al PIN di Prato. Gli studenti
scelgono dal menù, compongono il vassoio e inviano l'ordine **su WhatsApp**
con un messaggio già pronto; poi passano a ritirare e pagano al banco.
Il sito non riceve e non conserva ordini né dati dei clienti.

Il titolare gestisce tutto da telefono nel **pannello** (`/admin`, PIN di sei
cifre): cosa è finito oggi, primo del giorno, ordini in pausa, chiusure,
menù con foto, orari e dati legali.

## Avvio in locale

Serve Node 22.9 o superiore.

```bash
npm install
cp .env.example .env    # facoltativo: le impostazioni di base vanno già bene
npm run seed            # prepara il database e STAMPA il PIN del pannello
npm start               # http://localhost:3000  ·  pannello: /admin
```

Il sito ascolta solo su questo computer. Per farlo vedere da un telefono:

- **Stessa rete wifi o hotspot:** `HOST=0.0.0.0 npm start`, poi
  `http://IP-DEL-COMPUTER:3000`.
- **Da qualunque posto, gratis:** `npm run condividi` (serve
  [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).
  Stampa un indirizzo `https://….trycloudflare.com` valido finché il
  computer resta acceso.
- **Su un telefono Android con Termux:** `./avvia.sh` (hotspot) o
  `./avvia.sh --pubblico` (tunnel).

Per motivi di sicurezza il sito non parte, se è raggiungibile da altri, finché
il PIN è il vecchio `246810`. Per cambiarlo:
`npm run seed -- --pin=NNNNNN --solo-pin`.

## Messa online

VPS Debian 12 + dominio, HTTPS automatico con Caddy, copie di sicurezza ogni
notte e aggiornamenti con ritorno automatico alla versione precedente:
istruzioni complete in [deploy/LEGGIMI.md](deploy/LEGGIMI.md).

Prima di consegnare il sito al locale: [docs/consegna.md](docs/consegna.md).
Guida per il titolare: [docs/guida-rapida.md](docs/guida-rapida.md).

## Struttura

```
server/
  server.js      avvio: legge .env, controlli di sicurezza, ascolto
  app.js         intestazioni di sicurezza, controllo d'origine, rotte, file statici
  render.js      pagina principale composta dal server (menù già nell'HTML)
  legale.js      privacy, allergeni, condizioni d'ordine, crediti, robots, sitemap
  auth.js        PIN (scrypt), sessioni con hash, limiti sui tentativi
  valida.js      controllo dei dati che arrivano dal pannello
  foto.js        controllo e salvataggio delle foto caricate
  db.js          database SQLite · schema.sql · seed.js (menù e PIN)
  rotte/         pubbliche.js · admin.js
  modelli/       index.html e pagina.html (modelli delle pagine)
public/
  app.js         vassoio, orari di ritiro, messaggio WhatsApp, dettaglio prodotto
  movimento.js   animazioni (solo in risposta ai gesti)
  lib/           codice condiviso fra server e browser: orari, WhatsApp, allergeni, escape
  admin.*  admin/  pannello del locale
  style.css · icons.svg · fonts/ · img/
deploy/          VPS: setup, Caddy, systemd, backup, aggiornamenti
test/            test (node --test) · e2e/ test nel browser (Playwright)
docs/            progetto, piano, guida per il titolare, consegna
```

Nessun framework e nessuna compilazione: due dipendenze (`express`,
`better-sqlite3`). Orari e date sono sempre calcolati nel fuso di Roma.

## Test

```bash
npm test                 # logica e API, circa 3 secondi
npx playwright install   # una volta sola: i browser per i test
npm run test:e2e         # vetrina e pannello su Android (Chromium) e iPhone (WebKit)
```
