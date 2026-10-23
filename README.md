# Container Serraglio — vetrina con ordini

Sito pubblico e pannello di gestione. **Progetto separato** da
`container-serraglio`: stessi dati, impianto grafico diverso e pannello
rifatto per l'uso da telefono.

```
public/   index.html (vetrina) · admin.html (pannello) · CSS, JS, immagini
server/   server Express, database SQLite, dati iniziali
dati/     il file del database, creato al primo avvio ed escluso da git
```

## Avvio

```bash
npm install
cp .env.example .env     # e cambia ADMIN_PIN
npm run seed
npm start
```

Sito su `http://localhost:3000`, pannello su `http://localhost:3000/admin`.
PIN iniziale: quello scritto in `.env` (`246810` se non lo cambi).

## Portarlo in giro su un telefono

Il sito può girare sul telefono stesso, senza computer acceso. Qui sotto la
procedura per **Termux**; su Kali in chroot i comandi sono gli stessi con
`apt` al posto di `pkg`.

### 1. Preparare Termux

Termux va installato da **F-Droid o GitHub**, non dal Play Store: quella
versione è ferma da anni e i pacchetti non si aggiornano.

```bash
pkg update && pkg upgrade
pkg install nodejs-lts git tmux
node -v                      # 20 o più
```

### 2. Gli strumenti di compilazione

`better-sqlite3`, il modulo che parla col database, è scritto in C e va
compilato. Su un Linux normale si scarica già pronto, ma **Termux non usa
glibc**: i binari precompilati per `linux-arm64` non funzionano e la
compilazione parte per forza.

```bash
pkg install python clang make binutils
```

### 3. Il progetto

```bash
git clone <il-tuo-repo>
cd container-serraglio-vetrina
npm install                  # qui compila: diversi minuti, è normale
./avvia.sh
```

Lo script controlla tutto, prepara il database al primo giro, avvia dentro
`tmux` e stampa l'indirizzo locale. Dal telefono principale collegato
all'hotspot si apre `http://INDIRIZZO:3000`.

**Se `npm install` fallisce** sulla compilazione, la via d'uscita è
sostituire `better-sqlite3` con `node:sqlite`, il modulo SQLite incluso in
Node dalla versione 22: non va compilato niente, e cambia solo `server/db.js`.

### 4. Da fuori: tunnel Cloudflare

Un tunnel è un processo che apre una connessione **in uscita** verso
Cloudflare e si fa consegnare le richieste da lì. Niente porte da aprire,
niente IP pubblico, e HTTPS già pronto.

```bash
pkg install cloudflared
./avvia.sh --pubblico
```

L'indirizzo pubblico compare nella seconda finestra di tmux
(`tmux attach -t container`, poi `Ctrl-b 1`).

Attenzione: il pacchetto `.deb` che Cloudflare pubblica su GitHub **non
funziona su Termux**, perché è compilato per glibc. Va installato dai
repository di Termux, come sopra.

L'indirizzo è casuale e **cambia a ogni avvio**, il tunnel vive finché vive
il processo, e Cloudflare lo dichiara adatto solo alle prove. Per un
indirizzo stabile servono un account gratuito e un dominio sul DNS di
Cloudflare.

### 5. Tenerlo vivo

```bash
termux-wake-lock             # lo script lo fa da solo se c'è
```

Android spegne i processi in secondo piano per risparmiare batteria. Oltre
al wake lock conviene escludere Termux dalle ottimizzazioni di batteria
nelle impostazioni di sistema, e tenere il telefono in carica.

### Due trappole

**La batteria.** Telefono spento o scarico significa sito giù. Per una
prova va benissimo, per un servizio vero no.

**Il cookie Secure.** Con `NODE_ENV=production` il cookie di sessione
viaggia solo in HTTPS. Dal tunnel va bene; da `http://indirizzo-locale` il
pannello **non riesce più ad accedere** e sembra che il PIN sia sbagliato.
Scegli in base a come lo stai usando.

## Il pannello

Pensato per essere usato in piedi, col telefono in una mano. Le scelte
derivano da lì:

- **PIN di sei cifre** invece della password: si digita sulla tastiera dei
  numeri, e appena la sesta cifra è inserita si entra da soli. La sessione
  dura tre giorni, così non si rifà l'accesso ogni mattina.
- **Navigazione in basso**, dove arriva il pollice, non in alto.
- **Testo base 18 px e comandi alti almeno 56 px**: si colpiscono senza
  mirare.
- **Conferma con l'ora dopo ogni salvataggio** ("Scorte aggiornate ·
  10:14"). Senza, chi usa il pannello ripete l'operazione per sicurezza.
- **Niente gesti nascosti**: tutto è un pulsante o un interruttore visibile.

### Schermata "Oggi"

Le tre cose che cambiano ogni giorno, in ordine di frequenza:

1. **Primo piatto di oggi** — si scrive e si salva, compare subito sul
   sito. Ha una chiamata dedicata (`PUT /api/admin/primo`) proprio perché
   è l'operazione più frequente: un campo e un pulsante, niente altro.
2. **Pezzi arrivati dal panificio** — più e meno al posto della tastiera,
   con sotto quanti ne restano e quanti ne sono stati venduti. Il pulsante
   "Come ieri" ricopia le quantità del giorno prima.
3. **Cosa è finito** — un interruttore per prodotto. Spento, il prodotto
   sparisce dal sito all'istante.

Ordini e impostazioni rare (prezzi, orari, sospensione ordini, cambio PIN)
stanno nelle altre due schermate, dove non intralciano.

## Sicurezza del PIN

Sei cifre fanno un milione di combinazioni: tante per una persona, poche
per una macchina. La difesa vera non è la lunghezza ma il limitatore nel
server: **sei tentativi ogni quindici minuti per dispositivo**. Il PIN non
è salvato in chiaro ma derivato con scrypt e un sale casuale, e il server
rifiuta i PIN prevedibili (tutte cifre uguali o in sequenza).

Se un domani il pannello dovesse gestire anche i pagamenti, il PIN non
basterebbe più: a quel punto servirebbe una password vera o un secondo
fattore.

## Prima di andare online

- [ ] Cambiare il PIN dal pannello
- [ ] Sostituire i dati contrassegnati "dato di esempio"
- [ ] Far verificare gli allergeni in cucina
- [ ] Inserire le quantità vere del panificio
- [ ] Sostituire le immagini di prova con foto dei prodotti veri
- [ ] `NODE_ENV=production` per attivare il cookie Secure
- [ ] Hosting con Node e **disco persistente**, altrimenti il database si
      azzera a ogni rilascio
