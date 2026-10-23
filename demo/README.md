# Demo animata

Copia della vetrina con le animazioni, tenuta separata da `public/`: il
sito vero non cambia finché non si decide di portarle di là.

```bash
npm run demo        # oppure: node demo/server.mjs
```

Si apre su `http://localhost:3001`. Non serve `npm install` né il
database: il menù è quello DEMO scritto in `app.js`, e l'invio
dell'ordine prepara il messaggio WhatsApp invece di registrarlo.

Se il sistema ha "riduci movimento" attivo (su Windows: Impostazioni →
Accessibilità → Effetti visivi → Effetti di animazione spenti) le
animazioni non partono, com'è giusto. Per vederle lo stesso:
`http://localhost:3001/?movimento`.

## Cosa c'è di diverso da `public/`

- `motion.js` — tutto il movimento: scorrimento morbido con
  [Lenis](https://github.com/darkroomengineering/lenis), animazioni con
  [GSAP](https://github.com/greensock/GSAP) e ScrollTrigger, effetti di
  [React Bits](https://github.com/DavidHDev/react-bits) riscritti senza
  React (BlurText, SplitText, CountUp, TiltedCard, ScrollVelocity,
  AnimatedContent, SpotlightCard, Magnet, DecryptedText).
- `vendor/` — GSAP 3.15.0 e Lenis 1.3.26, copiati e non presi da CDN:
  la CSP del server accetta solo script dal sito stesso, e così tutto
  funziona anche sull'hotspot senza internet.
- `index.html` — il nastro dei prodotti sotto l'hero, gli script in
  fondo e `data-lenis-prevent` sulla finestra dell'ordine.
- **Testi** — nuova sezione "Come funziona" (Componi l'ordine, Scegli
  l'ora di ritiro, Invia e passa a ritirare), raggiungibile dal secondo
  pulsante dell'hero, che prima era il numero di telefono; il numero è
  rimasto in fondo alla sezione e nel piede. Testi più diretti in hero,
  striscia, menù ("Cosa mangi oggi?"), "Dove siamo" e nella barra del
  vassoio ("Completa l'ordine").
- `app.js` — due righe che mandano l'evento `menu:mostrato`, e il menù
  mobile rifatto: lo stato è la classe `nav-aperta` su `<html>` invece
  di `hidden`, così il CSS anima apertura e chiusura; si chiude anche
  con Esc e il pannello da chiuso è `inert`.
- **Menù mobile** — pannello a tutto schermo che si apre come un cerchio
  dal pulsante, due righe che diventano una X, voci grandi numerate che
  entrano in fila, "Ordina ora" e telefono in fondo. Sta fuori dalla
  testata perché il suo `backdrop-filter` non lo lascerebbe coprire lo
  schermo.
- `style.css` — un blocco in fondo per il movimento; corretti anche il
  commento iniziale, che parlava ancora di un sito senza server, e la
  regola `[hidden]` ripetuta due volte.

## Foto dei prodotti

I dodici prodotti che non avevano immagine ne hanno una presa da
Wikimedia Commons (licenze CC BY e CC BY-SA), scontornata con rembg,
ritagliata e salvata in `img/` come webp trasparente da 600 px, come le
altre. Le foto sono indicative: per esempio "Container Serraglio 1" è un
panino con porchetta e la pinsa al salamino è una pizza su pane naan.

Le licenze chiedono di citare autore e fonte: lo fa `crediti.html`,
collegata dal piede del sito. Le foto CC BY-SA, così modificate, restano
CC BY-SA. Se una foto viene sostituita, va tolta anche da lì.

Nel sito vero il percorso della foto è la colonna `foto` dei prodotti
nel database, riempita da `server/seed.js`; qui è scritto nei dati DEMO
di `app.js`.

Per portare le animazioni sul sito vero basta copiare questi file in
`public/` (il pannello `admin` non è toccato).
