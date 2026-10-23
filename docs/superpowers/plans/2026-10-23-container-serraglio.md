# Container Serraglio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing vetrina into a production-grade, WhatsApp-ordering
storefront (design B) with a simple phone admin, strict security, Italian/EU
legal pages and a VPS deploy kit.

**Architecture:** Express app built by a factory (`creaApp`) over a SQLite DB
opened by `apriDb(path)`; the home page is server-rendered from a template and
cached until an admin write. Pure logic (time, WhatsApp, escaping, allergens)
lives in `public/lib/*.js` as ES modules imported by both the server and the
browser. No build step; vanilla JS/CSS.

**Tech Stack:** Node ≥ 20 (dev machine has 22), Express 4, better-sqlite3,
`node:test`, Playwright (dev only), Caddy + systemd (deploy).

**Spec:** `docs/superpowers/specs/2026-10-23-container-serraglio-design.md`

**Plan refinements of the spec (decided here):**
- Shared pure modules live in `public/lib/` (served to the browser, imported
  by the server) instead of `server/orari.js` / `public/whatsapp.js`.
- Uploaded photos are stored in **one size (640 px)**: cards are ≤ 210 CSS px
  wide (≤ 630 device px at DPR 3), so a 320 px variant adds complexity for
  ~20 KB savings. Stand-in photos keep their existing 600 px files.
- Routes split into `server/rotte/pubbliche.js` and `server/rotte/admin.js`.

## Global Constraints

- Runtime deps exactly: `express`, `better-sqlite3`. Dev deps: `@playwright/test` only.
- `"type": "module"`, `"engines": { "node": ">=20" }`.
- All user-facing copy in **Italian**; identifiers follow the existing Italian naming (`leggiMenu`, `impostazione`, …).
- All dates/times computed in **Europe/Rome** via `Intl.DateTimeFormat`; functions take `now: Date` as a parameter.
- Dates `AAAA-MM-GG` (`sv-SE` format), times `HH:MM`; day index 0 = lunedì … 6 = domenica.
- No inline `<script>` code, no `style="…"` attributes, no `on*=` attributes anywhere (CSP `script-src 'self'; style-src 'self'`). JSON data blocks use `<script type="application/json">`.
- No third-party requests from any page (fonts self-hosted, no maps embed, no analytics).
- Colors: cream `#F4F1EA`, card `#FFFFFF`, ink `#111A2B`, muted `#56637A`, navy `#0B1C2E`, navy-2 `#112C47`, blue `#1F4C98`, yellow `#FFC42E`.
- Fonts: Bricolage Grotesque 700/800 (headings), DM Sans 400/500/700 (body), woff2 Latin subset, `font-display: swap`.
- Allergen codes, exactly: `glutine, crostacei, uova, pesce, arachidi, soia, latte, frutta_guscio, sedano, senape, sesamo, solfiti, lupini, molluschi`.
- API errors: JSON `{ "errore": "<frase italiana>" }`.
- Session cookie: `__Host-sessione` in production (`HttpOnly; Secure; SameSite=Strict; Path=/`), `sessione` without `Secure` when `NODE_ENV !== "production"`; 30-day sliding.
- Motion: no scroll-triggered reveals, scroll hijacking, parallax, marquee, cursor followers; everything instant under `prefers-reduced-motion: reduce`.
- Budgets: HTML+CSS+JS ≤ 60 KB gzip, `app.js`+libs ≤ 12 KB gzip; Lighthouse mobile ≥ 95 ×4; LCP < 1.8 s; CLS 0.
- Commit after every task; messages in Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Accents, emoji, `&`, `<`, quotes in product names and customer notes** must come out intact in the WhatsApp text (UTF-8 via `encodeURIComponent`) and as literal text in HTML. Tests: Task 3 (`componiMessaggio` with "Caffè & <b>emoji 🍕</b>"), Task 10 (render of a product named `<img src=x onerror=alert(1)>`).
2. **Customer leaves the tray open across closing time or past a pickup slot**: when the tray sheet opens or "Invia" is tapped, pickup times are recomputed; an expired selection is replaced and, if none remain, the button is disabled with the closed message. Tests: Task 2 (`orariRitiro` at 14:51 with close 15:00 → `[]`), Task 13 (E2E with clock advanced).
3. **Server running in UTC around midnight / DST**: "today", sold-out reset and closures follow Rome time. Tests: Task 2 (`oraRoma` at `2026-10-24T22:30:00Z` → `2026-10-25`, and DST day 2026-10-25), Task 4 (`finito_il` set "yesterday" Rome time is not sold-out today).
4. **Stale tray in localStorage** (product deleted, sold-out, price changed since last visit): entries are dropped/repriced from current menu with a visible notice. Test: Task 13 E2E (seed tray with unknown id + sold-out id → notice shown, total uses current prices).
5. **Owner's sloppy input**: prices "6,50", "6.5", " 7 € " → accepted; "abc", "-1", "1000" → plain-Italian error; WhatsApp "+39 327 053 6624" → normalized to digits. Tests: Task 7 (`leggiPrezzo`, `normalizzaWhatsapp`).

---

## Milestone 1 — Backend cleanup

### Task 1: Test harness and shared pure libs (escape, allergens)

**Files:**
- Modify: `package.json`
- Create: `public/lib/escape.js`, `public/lib/allergeni.js`
- Test: `test/escape.test.js`, `test/allergeni.test.js`

**Interfaces:**
- Produces:
  - `escapeHtml(valore: any) -> string` — escapes `& < > " '`; `null/undefined → ""`.
  - `jsonPerHtml(oggetto: any) -> string` — `JSON.stringify` then replace `<`→`<`, `>`→`>`, `&`→`&`, U+2028/U+2029 → ` `/` `.
  - `ALLERGENI: ReadonlyArray<{codice: string, etichetta: string}>` — 14 entries in the Global Constraints order; labels: Glutine, Crostacei, Uova, Pesce, Arachidi, Soia, Latte, Frutta a guscio, Sedano, Senape, Sesamo, Solfiti, Lupini, Molluschi.
  - `validaAllergeni(lista: string[]) -> string[] | null` — deduplicated, ordered as `ALLERGENI`; `null` if any unknown code.
  - `etichetteAllergeni(csv: string) -> string[]` — labels for a stored CSV, ordered as `ALLERGENI`, unknown codes ignored.

- [ ] **Step 1:** In `package.json` set scripts `"test": "node --test test/"`, `"test:e2e": "playwright test"`, keep `start`/`seed`, remove `demo`. Add devDependency `@playwright/test` (`npm i -D`). Commit lockfile.
- [ ] **Step 2: Write failing tests**

```js
// test/escape.test.js
test("escapeHtml neutralizza i tag", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`),
    "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHtml(null), "");
});
test("jsonPerHtml non chiude il tag script", () => {
  const s = jsonPerHtml({ a: "</script><b>& " });
  assert.ok(!s.includes("</script>") && !s.includes("<") && !s.includes("&"));
  assert.deepEqual(JSON.parse(s), { a: "</script><b>& " });
});
// test/allergeni.test.js
test("validaAllergeni ordina e deduplica", () =>
  assert.deepEqual(validaAllergeni(["latte", "glutine", "latte"]), ["glutine", "latte"]));
test("validaAllergeni rifiuta codici sconosciuti", () =>
  assert.equal(validaAllergeni(["glutine", "noci"]), null));
test("etichetteAllergeni", () =>
  assert.deepEqual(etichetteAllergeni("frutta_guscio,boh,latte"), ["Latte", "Frutta a guscio"]));
```
- [ ] **Step 3:** Run `npm test` → FAIL (modules missing).
- [ ] **Step 4:** Implement both modules (ES modules, no imports).
- [ ] **Step 5:** Run `npm test` → PASS.
- [ ] **Step 6:** Commit `feat: shared escaping and EU allergen helpers`.

### Task 2: Time logic in Europe/Rome (`public/lib/orari.js`)

**Files:**
- Create: `public/lib/orari.js`
- Test: `test/orari.test.js`

**Interfaces:**
- Produces (all pure; `orari = [{giorno:0..6, apertura:"HH:MM"|null, chiusura:"HH:MM"|null}]`, `chiusure = string[]` of `AAAA-MM-GG`):
  - `oraRoma(now: Date) -> {data: string, minuti: number, giorno: number}`
  - `aggiungiGiorni(data: string, n: number) -> string`
  - `statoApertura({orari, chiusure, now}) -> {aperto: boolean, chiusoOggi: boolean, chiudeAlle: string|null, riapre: {data, ora, etichetta}|null}` — `etichetta` is `"oggi alle 10:00"`, `"domani alle 10:00"` or `"lunedì alle 10:00"` (weekday lower-case); `riapre` searches up to 14 days ahead; `chiusoOggi` true when today is in `chiusure`.
  - `orariRitiro({orari, chiusure, now, anticipo = 15, passo = 10}) -> string[]` — today only; first slot = `ceil(max(minuti + anticipo, apertura) / passo) * passo`; last slot ≤ `chiusura − passo`; `[]` if closed/closure.
  - `testoStato(stato) -> string` — `"Aperto · fino alle 15:00"`, `"Chiuso oggi · riapre domani alle 10:00"`, `"Chiuso · riapre lunedì alle 10:00"`.

- [ ] **Step 1: Write failing tests** (fixture `orari`: Mon–Fri 10:00–15:00, Sat/Sun closed)

```js
const roma = s => new Date(s); // ISO with explicit offset
test("oraRoma usa il fuso di Roma anche con server in UTC", () =>
  assert.deepEqual(oraRoma(new Date("2026-10-24T22:30:00Z")), { data: "2026-10-25", minuti: 30, giorno: 6 }));
test("oraRoma nel giorno del cambio d'ora", () =>
  assert.equal(oraRoma(new Date("2026-10-25T11:00:00Z")).minuti, 12 * 60)); // CET dopo le 03:00
test("aperto a metà mattina", () => {
  const s = statoApertura({ orari, chiusure: [], now: roma("2026-10-23T12:00:00+02:00") });
  assert.equal(s.aperto, true); assert.equal(s.chiudeAlle, "15:00");
  assert.equal(testoStato(s), "Aperto · fino alle 15:00");
});
test("venerdì sera riapre lunedì", () => {
  const s = statoApertura({ orari, chiusure: [], now: roma("2026-10-23T18:00:00+02:00") });
  assert.equal(s.aperto, false); assert.equal(s.riapre.etichetta, "lunedì alle 10:00");
});
test("prima dell'apertura riapre oggi", () =>
  assert.equal(statoApertura({ orari, chiusure: [], now: roma("2026-10-22T08:00:00+02:00") }).riapre.etichetta, "oggi alle 10:00"));
test("chiusura straordinaria", () => {
  const s = statoApertura({ orari, chiusure: ["2026-10-22"], now: roma("2026-10-22T12:00:00+02:00") });
  assert.equal(s.aperto, false); assert.equal(s.chiusoOggi, true);
  assert.equal(testoStato(s), "Chiuso oggi · riapre domani alle 10:00");
});
test("orariRitiro arrotonda e rispetta l'anticipo", () =>
  assert.deepEqual(orariRitiro({ orari, chiusure: [], now: roma("2026-10-22T14:22:00+02:00") }), ["14:40", "14:50"]));
test("orariRitiro prima dell'apertura parte dall'apertura", () =>
  assert.equal(orariRitiro({ orari, chiusure: [], now: roma("2026-10-22T07:00:00+02:00") })[0], "10:00"));
test("orariRitiro vuoto a ridosso della chiusura", () =>
  assert.deepEqual(orariRitiro({ orari, chiusure: [], now: roma("2026-10-22T14:51:00+02:00") }), []));
test("orariRitiro vuoto nel weekend", () =>
  assert.deepEqual(orariRitiro({ orari, chiusure: [], now: roma("2026-10-24T12:00:00+02:00") }), []));
```
- [ ] **Step 2:** Run `node --test test/orari.test.js` → FAIL.
- [ ] **Step 3:** Implement. `oraRoma` uses one cached `Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Rome", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", weekday:"short", hourCycle:"h23"})` and `formatToParts`. `aggiungiGiorni` does UTC-date arithmetic on the string.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: Rome-time opening status and pickup times`.

### Task 3: WhatsApp message builder (`public/lib/whatsapp.js`)

**Files:**
- Create: `public/lib/whatsapp.js`
- Test: `test/whatsapp.test.js`

**Interfaces:**
- Produces:
  - `euro(n: number) -> string` — `"12,00 €"` (it-IT, 2 decimals, NBSP before €).
  - `pulisci(testo: string, max: number) -> string` — removes control chars and `* _ ~ \``, collapses whitespace/newlines to single spaces, trims, truncates to `max` code points.
  - `componiMessaggio({nome, ora, righe: [{nome, quantita, prezzo}], note, demo}) -> string` — exact format below; calls `pulisci(nome, 40)`, `pulisci(note, 200)`.
  - `linkWhatsApp(numero: string, testo: string) -> string` — `https://wa.me/${digits only}?text=${encodeURIComponent(testo)}`.

Exact format (lines joined by `\n`; `Note:` line omitted when empty; `[DEMO] ` prefix on line 1 when `demo`):
```
Ciao! Ordine per il ritiro alle 13:10
Nome: Giulia
• 2× Container Serraglio 1 — 12,00 €
• 1× Hamburgher — 8,00 €
Totale: 20,00 € (pago al ritiro)
Note: senza maionese
```

- [ ] **Step 1: Write failing tests**

```js
test("messaggio completo", () => {
  const m = componiMessaggio({ nome: "Giulia", ora: "13:10", note: "senza maionese", demo: false,
    righe: [{ nome: "Container Serraglio 1", quantita: 2, prezzo: 6 }, { nome: "Hamburgher", quantita: 1, prezzo: 8 }] });
  assert.equal(m, "Ciao! Ordine per il ritiro alle 13:10\nNome: Giulia\n• 2× Container Serraglio 1 — 12,00 €\n• 1× Hamburgher — 8,00 €\nTotale: 20,00 € (pago al ritiro)\nNote: senza maionese");
});
test("demo e note vuote", () => {
  const m = componiMessaggio({ nome: "Luca", ora: "12:00", note: "", demo: true, righe: [{ nome: "Hot dog", quantita: 1, prezzo: 8 }] });
  assert.ok(m.startsWith("[DEMO] Ciao!")); assert.ok(!m.includes("Note:"));
});
test("pulisci toglie formattazione e a capo", () =>
  assert.equal(pulisci("  *ciao*\n_mondo_ ~x~ `y`\u0007 ", 40), "ciao mondo x y"));
test("accenti, emoji e simboli arrivano intatti", () => {
  const url = linkWhatsApp("39 327-053", componiMessaggio({ nome: "Niccolò", ora: "12:00", note: "Caffè & <b>emoji 🍕</b>", demo: false, righe: [{ nome: "Più", quantita: 1, prezzo: 6.5 }] }));
  assert.ok(url.startsWith("https://wa.me/39327053?text="));
  assert.ok(decodeURIComponent(url.split("text=")[1]).includes("Caffè & <b>emoji 🍕</b>"));
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: WhatsApp order message builder`.

### Task 4: New schema and data layer (`server/db.js`, `schema.sql`, `seed.js`)

**Files:**
- Rewrite: `server/schema.sql`, `server/db.js`, `server/seed.js`
- Test: `test/db.test.js`, helper `test/aiuto.js`

**Interfaces:**
- Consumes: `etichetteAllergeni` (Task 1).
- Produces:
  - `apriDb(percorso: string) -> Database` — `":memory:"` allowed; applies `schema.sql`, WAL (file DBs only), foreign keys.
  - `leggiMenu(db, {oggi: string, ancheNascosti = false}) -> Categoria[]` where `Categoria = {id, nome, nota, prezzo, posizione, prodotti: Prodotto[]}` and `Prodotto = {id, categoria_id, nome, descrizione, allergeni: string[] /*codes*/, surgelati: boolean, foto: string|null, prezzo: number|null, prezzo_finale: number, disponibile: boolean, finito: boolean /* finito_il === oggi */, posizione}`.
  - `leggiOrari(db) -> {giorno, apertura, chiusura}[]`; `leggiChiusure(db, daData: string) -> {data, motivo}[]` (data ≥ daData, sorted).
  - `leggiImpostazioni(db, {tutte = false}) -> Record<string,string>`; `impostazione(db, chiave, predefinito = null) -> string|null`; `scriviImpostazione(db, chiave, valore)`.
  - `seed.js` exports `semina(db, {pin})`; runs as CLI when executed directly (compare `import.meta.url` with `pathToFileURL(process.argv[1]).href`), CLI accepts `--pin=NNNNNN` (default env `ADMIN_PIN` or `246810`).
  - `test/aiuto.js`: `dbDiProva() -> Database` (`apriDb(":memory:")` + `semina(db, {pin: "482915"})`).
- Schema per spec §3: `categorie, prodotti(+surgelati, finito_il), orari, chiusure(data PK, motivo), impostazioni, utenti, sessioni(token_hash PK, utente, creato_il, ultimo_uso, scade_il, dispositivo), accessi(id, quando, esito CHECK IN ('ok','ko'), dispositivo, ip_troncato)`. No `ordini, righe_ordine, scorte`.
- Seed settings per spec §3 (remove `capienza_fascia`, `giorni_conservazione`; add `google_voto`, `google_recensioni`, `google_aggiornato`, `google_link`, `rea` as `""`; `modalita_demo = "1"`, `allergeni_verificati = "0"`; legal fields `""` — no invented values). Products: current list with allergen **codes**, descriptions without trailing period, `foto` set for products that have a Wikimedia stand-in in `demo/public/img` (filenames kept; files are moved in Task 19).

- [ ] **Step 1: Write failing tests**

```js
test("finito solo nel giorno impostato", () => {
  const db = dbDiProva();
  db.prepare("UPDATE prodotti SET finito_il = ? WHERE id = 'hb'").run("2026-10-22");
  const trova = oggi => leggiMenu(db, { oggi }).flatMap(c => c.prodotti).find(p => p.id === "hb");
  assert.equal(trova("2026-10-22").finito, true);
  assert.equal(trova("2026-10-23").finito, false);
});
test("prezzo_finale usa la categoria se il prodotto non ha prezzo", () => {
  const p = leggiMenu(dbDiProva(), { oggi: "2026-10-22" })[0].prodotti[0];
  assert.equal(p.prezzo, null); assert.equal(p.prezzo_finale, 6);
});
test("i nascosti non compaiono nel menù pubblico", () => {
  const db = dbDiProva();
  db.prepare("UPDATE prodotti SET disponibile = 0 WHERE id = 'hd'").run();
  assert.ok(!leggiMenu(db, { oggi: "2026-10-22" }).flatMap(c => c.prodotti).some(p => p.id === "hd"));
  assert.ok(leggiMenu(db, { oggi: "2026-10-22", ancheNascosti: true }).flatMap(c => c.prodotti).some(p => p.id === "hd"));
});
test("allergeni come codici", () =>
  assert.deepEqual(leggiMenu(dbDiProva(), { oggi: "2026-10-22" })[0].prodotti[0].allergeni, ["glutine", "latte"]));
test("nessuna tabella ordini", () =>
  assert.equal(dbDiProva().prepare("SELECT name FROM sqlite_master WHERE name IN ('ordini','scorte')").all().length, 0));
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `refactor!: drop orders and stock, new menu schema`.

### Task 5: Authentication module (`server/auth.js`)

**Files:**
- Create: `server/auth.js`
- Test: `test/auth.test.js`

**Interfaces:**
- Consumes: `dbDiProva` (Task 4).
- Produces:
  - `creaHash(pin) -> {hash, sale}`; `verificaPin(pin, hash, sale) -> boolean` (scrypt 64, `timingSafeEqual` — moved from db.js).
  - `pinBanale(pin: string) -> boolean` — true if not 6 digits, all same digit, a substring of `"01234567890"` or `"09876543210"`, or `"246810"`.
  - `hashToken(token) -> string` (sha256 hex).
  - `creaSessione(db, {utente, dispositivo, now}) -> string` (raw token; stores hash; `scade_il = now + 30d`).
  - `leggiSessione(db, token, now) -> {utente, token_hash} | null` — deletes expired; on success sets `ultimo_uso = now`, `scade_il = now + 30d`.
  - `chiudiSessione(db, token)`; `chiudiAltreSessioni(db, utente, tokenDaTenere)`.
  - `creaLimitatore({now = Date.now}) -> {consenti(chiave, max, finestraMs) -> boolean}`.
  - `creaGuardiaLogin({now = Date.now}) -> {bloccato(ip) -> boolean, fallito(ip), riuscito(ip)}` — per IP 5 failures / 15 min; global 30 failures / 60 min → `bloccato` true for every IP for 60 min after the 30th failure.
  - `troncaIp(ip) -> string` — IPv4 `/24`, IPv4-mapped IPv6 as IPv4, IPv6 `/48`.
  - `descriviDispositivo(userAgent) -> string` — `"Android · Chrome"`, `"iPhone · Safari"`, `"Windows · Firefox"`…, fallback `"Dispositivo sconosciuto"`, max 40 chars.
  - `registraAccesso(db, {esito, dispositivo, ip, now})` — inserts with truncated IP; deletes rows older than 30 days.

- [ ] **Step 1: Write failing tests**

```js
test("il token non è salvato in chiaro", () => {
  const db = dbDiProva(); const t = creaSessione(db, { utente: "banco", dispositivo: "x", now: new Date() });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessioni WHERE token_hash = ?").get(t).n, 0);
  assert.ok(leggiSessione(db, t, new Date()));
});
test("sessione scaduta dopo 30 giorni senza uso", () => {
  const db = dbDiProva();
  const t = creaSessione(db, { utente: "banco", dispositivo: "x", now: new Date("2026-01-01T00:00:00Z") });
  assert.equal(leggiSessione(db, t, new Date("2026-02-01T00:00:00Z")), null);
});
test("sessione si rinnova con l'uso", () => {
  const db = dbDiProva(); const t = creaSessione(db, { utente: "banco", dispositivo: "x", now: new Date("2026-01-01Z") });
  assert.ok(leggiSessione(db, t, new Date("2026-01-25Z")));
  assert.ok(leggiSessione(db, t, new Date("2026-02-20Z")));
});
test("blocco globale dopo 30 errori", () => {
  const g = creaGuardiaLogin({ now: () => 0 });
  for (let i = 0; i < 30; i++) g.fallito(`10.0.${i}.1`);
  assert.equal(g.bloccato("192.168.1.1"), true);
});
test("blocco per IP dopo 5 errori", () => {
  const g = creaGuardiaLogin({ now: () => 0 });
  for (let i = 0; i < 5; i++) g.fallito("1.2.3.4");
  assert.equal(g.bloccato("1.2.3.4"), true); assert.equal(g.bloccato("5.6.7.8"), false);
});
test("pinBanale", () => {
  for (const p of ["111111", "123456", "654321", "246810", "12345"]) assert.equal(pinBanale(p), true, p);
  assert.equal(pinBanale("482915"), false);
});
test("troncaIp", () => {
  assert.equal(troncaIp("203.0.113.77"), "203.0.113.0");
  assert.equal(troncaIp("::ffff:203.0.113.77"), "203.0.113.0");
  assert.equal(troncaIp("2001:db8:abcd:12::1"), "2001:db8:abcd::");
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: hashed sliding sessions and login guard`.

### Task 6: App factory, security headers, public + auth routes

**Files:**
- Create: `server/app.js`, `server/rotte/pubbliche.js`, `server/rotte/admin.js` (auth part)
- Rewrite: `server/server.js` (read env, `apriDb`, `creaApp`, startup checks, listen)
- Test: `test/api-auth.test.js`; extend `test/aiuto.js`

**Interfaces:**
- Consumes: Tasks 4–5.
- Produces:
  - `creaApp({db, now = () => new Date(), produzione = false, cartellaFoto, cartellaPublic}) -> express.Application`; `app.locals.invalida()` clears the render cache (no-op until Task 10).
  - Middleware: `intestazioni` (CSP exactly as spec §7; `nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(self), microphone=(), geolocation=()`; `X-Frame-Options: DENY`; `app.disable("x-powered-by")`); `soloStessaOrigine` for non-GET under `/api/admin` (pass if `Sec-Fetch-Site: same-origin`, else `Origin` host must equal `Host`; else 403 `"Richiesta non consentita."`); `richiediJson` (415 `"Formato non valido."` unless `application/json`; photo route exempt); `richiediAccesso` (401 `"Sessione scaduta, rifai l'accesso."`); JSON body limit 32 kb; JSON 404 for `/api/*`; generic 500 `"Errore del server. Riprova fra poco."` (stack only in server log).
  - Routes: `GET /salute` → `{ok:true}` after `SELECT 1`; `GET /api/menu` → `{oggi, categorie, orari, chiusure, impostazioni}` (public settings); `POST /api/admin/login {pin}` (401 `"PIN non valido."`; 429 `"Troppi tentativi. Riprova fra un quarto d'ora."`; logs to `accessi`); `POST /api/admin/logout`; `POST /api/admin/logout-tutti`; `GET /api/admin/stato` → `{utente}`; `POST /api/admin/pin {attuale, nuovo}` (verifies current; `pinBanale` → 400 `"Scegli un PIN meno prevedibile: niente cifre uguali o in sequenza."`; deletes other sessions); `GET /api/admin/accessi` → last 20.
  - `server.js`: in production, if the stored PIN verifies as `"246810"`, log `"Cambia il PIN predefinito prima di andare online: npm run seed -- --pin=XXXXXX"` and exit 1. `TZ` is not relied on.
  - `test/aiuto.js`: `avviaProva({now, db}) -> Promise<{base, db, chiudi(), accedi() -> cookie, richiesta(metodo, percorso, {corpo, cookie, origine, tipo}) -> {stato, json, intestazioni}}>` via `app.listen(0)` + global `fetch`; default `Origin` = base; `db` defaults to a fresh `dbDiProva()` (pass one to reuse state across clocks).

- [ ] **Step 1: Write failing tests**

```js
test("login giusto imposta cookie HttpOnly SameSite=Strict", async () => {
  const p = await avviaProva(); const r = await p.richiesta("POST", "/api/admin/login", { corpo: { pin: "482915" } });
  assert.equal(r.stato, 200); assert.match(r.intestazioni.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  await p.chiudi();
});
test("PIN sbagliato: 401 e accesso registrato come ko", async () => { /* stato 401, errore "PIN non valido.", accessi last esito 'ko' */ });
test("sesto tentativo dallo stesso IP: 429", async () => { /* 5×401 then 429 */ });
test("scrittura da altra origine: 403", async () => {
  const p = await avviaProva(); const c = await p.accedi();
  const r = await p.richiesta("POST", "/api/admin/logout", { cookie: c, origine: "https://evil.example" });
  assert.equal(r.stato, 403); await p.chiudi();
});
test("scrittura senza JSON: 415", async () => { /* tipo "text/plain" → 415 */ });
test("cambio PIN chiude le altre sessioni", async () => { /* c1, c2; POST pin with c1; stato with c2 → 401, c1 → 200 */ });
test("intestazioni di sicurezza", async () => {
  const p = await avviaProva(); const r = await p.richiesta("GET", "/salute");
  assert.match(r.intestazioni.get("content-security-policy"), /script-src 'self'; style-src 'self'/);
  assert.equal(r.intestazioni.get("x-powered-by"), null); await p.chiudi();
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: app factory, security headers, auth routes`.

### Task 7: Admin content routes and validators

**Files:**
- Create: `server/valida.js`
- Modify: `server/rotte/admin.js`
- Test: `test/valida.test.js`, `test/api-admin.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 6.
- Produces (`server/valida.js`; each returns the clean value or throws `ErroreValidazione(messaggio)`, mapped to 400 `{errore}`):
  - `leggiPrezzo(v) -> number` — number or string like `"6,50"`, `"6.5"`, `" 7 € "`; rounded to cents; 0–500; error `"Il prezzo deve essere un numero, es. 6 o 6,50."`
  - `leggiTesto(v, {min = 0, max, campo}) -> string` — trimmed; error `` `${campo}: da ${min} a ${max} caratteri.` ``
  - `leggiData(v) -> string` (real calendar date), `leggiOra(v) -> string` (00:00–23:59).
  - `normalizzaWhatsapp(v) -> string` — strip spaces `+ - ( )`; `^\d{8,15}$`; error `"Numero WhatsApp non valido: scrivilo con il prefisso, es. 39 327 053 6624."`
  - `leggiLink(v) -> string` — `""` allowed; `https:` only; host without `www.` in `instagram.com, facebook.com, google.com, g.page, maps.app.goo.gl`.
  - `VALIDATORI_IMPOSTAZIONI: Record<string, (v) => string>` for every editable key in spec §3/§5: `google_voto` 1.0–5.0 one decimal (comma ok, stored with dot); `google_recensioni` int 0–100000; `anticipo_minimo` 0–120; `passo_fascia` ∈ {5,10,15,20,30}; `piva` 11 digits or `""`; `"0"|"1"` for `ordini_attivi`, `allergeni_verificati`, `modalita_demo`; texts via `leggiTesto`. Saving `google_voto` or `google_recensioni` also sets `google_aggiornato` = today (Rome).
- Routes (all behind `richiediAccesso` + write guards; every successful write calls `app.locals.invalida()`): the admin list in spec §6 except photo routes (Task 8). Behaviors: `POST prodotti/:id/sposta {direzione}` swaps `posizione` with the neighbor in the same category (200 no-op at edges); `PUT prodotti/:id/finito {finito}` sets `finito_il` = today Rome or NULL; `DELETE categorie/:id` with products → 409 `"Svuota la categoria prima di eliminarla."`; `POST chiusure {data, motivo}` upsert, `DELETE chiusure/:data`; `PUT orari` exactly 7 days with `apertura < chiusura` or both null; `PUT primo {descrizione}` updates the first product of category `primi` and clears its `finito_il`; `GET /api/admin/menu` → `{oggi, categorie (ancheNascosti), orari, chiusure, impostazioni (tutte), allergeni: ALLERGENI}`.

- [ ] **Step 1: Write failing tests**

```js
test("leggiPrezzo accetta virgola e simbolo", () => {
  assert.equal(leggiPrezzo("6,50"), 6.5); assert.equal(leggiPrezzo("6.5"), 6.5); assert.equal(leggiPrezzo(" 7 € "), 7);
  for (const v of ["abc", "-1", "1000", ""]) assert.throws(() => leggiPrezzo(v), /Il prezzo deve essere un numero/);
});
test("normalizzaWhatsapp", () => {
  assert.equal(normalizzaWhatsapp("+39 327 053 6624"), "393270536624");
  assert.throws(() => normalizzaWhatsapp("ciao"));
});
test("leggiLink rifiuta domini e schemi estranei", () => {
  assert.equal(leggiLink("https://www.instagram.com/containerserraglio/"), "https://www.instagram.com/containerserraglio/");
  for (const v of ["http://instagram.com/x", "https://evil.com", "javascript:alert(1)", "https://instagram.com.evil.com"]) assert.throws(() => leggiLink(v));
});
// test/api-admin.test.js
test("segna finito e torna disponibile il giorno dopo", async () => { /* now 2026-10-22T12:00+02:00 → PUT finito → /api/menu hb.finito true; new avviaProva on same db with now 2026-10-23 → false */ });
test("allergeni sconosciuti: 400", async () => {});
test("sposta su scambia la posizione", async () => {});
test("eliminare una categoria piena: 409", async () => {});
test("orari con apertura dopo chiusura: 400", async () => {});
test("chiusura di oggi compare in /api/menu", async () => {});
test("voto Google aggiorna la data", async () => { /* PATCH {google_voto:"4,7"} → google_voto "4.7", google_aggiornato "2026-10-22" */ });
test("ogni rotta admin senza sessione: 401", async () => { /* loop over every admin route/method */ });
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: admin menu, hours, closures and settings API`.

### Task 8: Photo upload and serving (`server/foto.js`)

**Files:**
- Create: `server/foto.js`
- Modify: `server/rotte/admin.js`, `server/rotte/pubbliche.js`
- Test: `test/foto.test.js` (fixtures built in-test as byte buffers; a real 1×1 PNG as base64 constant)

**Interfaces:**
- Produces:
  - `tipoImmagine(buf: Buffer) -> "webp"|"jpeg"|"png"|null` (magic bytes `RIFF....WEBP`, `FF D8 FF`, `89 50 4E 47 0D 0A 1A 0A`).
  - `dimensioniImmagine(buf, tipo) -> {larghezza, altezza} | null` (PNG IHDR; JPEG SOF0/SOF2 marker scan; WebP VP8/VP8L/VP8X).
  - `salvaFoto(cartella, buf, tipo) -> string` — `<16 hex>.<webp|jpg|png>`, written with `flag: "wx"`.
  - `eliminaFoto(cartella, nome)` — acts only if `nome` matches `^[0-9a-f]{16}\.(webp|jpg|png)$`.
- Routes: `PUT /api/admin/prodotti/:id/foto` with `express.raw({type: ["image/webp","image/jpeg","image/png"], limit: "3mb"})`; 30/hour per session; unknown bytes → 415 `"Usa una foto JPG, PNG o WebP."`; too big → 413 `"La foto è troppo grande (massimo 3 MB)."`; > 4000 px or unreadable → 400 `"Non riesco a leggere questa foto, provane un'altra."`; stores `foto = "foto/<nome>"`, deletes the previous uploaded file. `DELETE …/foto` → `foto = NULL` + delete file. `GET /foto/:nome` → validated name, `Content-Type` by extension, `nosniff`, `Cache-Control: public, max-age=31536000, immutable`; else 404.

- [ ] **Step 1: Write failing tests**

```js
test("riconosce i tipi dai byte, non dal nome", () => {
  assert.equal(tipoImmagine(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "webp");
  assert.equal(tipoImmagine(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')), null);
});
test("dimensioni PNG", () => { /* 1×1 PNG → {larghezza:1, altezza:1} */ });
test("upload SVG travestito: 415", async () => {});
test("upload valido poi servito con nosniff", async () => {});
test("eliminaFoto ignora nomi con percorsi", () => { /* "../server.js" → no throw, nothing deleted */ });
test("nomi foto non validi: 404", async () => { /* GET /foto/..%2Fserver.js → 404 */ });
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: validated photo upload and serving`.

**Milestone 1 gate:** `npm test` green; code-review agent on the M1 diff; fix findings; commit.

---

## Milestone 2 — Storefront (design B)

### Task 9: Visual foundation (fonts, illustrations, base CSS)

**Files:**
- Create: `public/fonts/*.woff2`, `public/fonts/OFL.txt`, `public/icons.svg`
- Rewrite: `public/style.css`

**Interfaces:**
- Produces: CSS custom properties `--crema --carta --inchiostro --tenue --notte --notte-2 --blu --giallo --r-s(14px) --r-m(18px) --r-l(28px) --f-titolo --f-testo`; component classes used by Task 10: `.wrap .kicker .sezione .sezione-scura .cat-testa .pillola-prezzo .griglia .scheda .scheda-media .scheda-ill .scheda-titolo .scheda-ingredienti .scheda-allergeni .piu .finito .badge-stato .badge-google .barra-vassoio .foglio .da-completare .nastro-demo`.
- `icons.svg` `<symbol>`s `#ill-schiacciata #ill-pinsa #ill-burger #ill-hotdog #ill-primo #ill-piatto` (`viewBox="0 0 80 80"`, navy stroke 3, yellow/blue fills) — refined, consistent versions of the approved drafts in `.superpowers/brainstorm/*/content/fallback-icons.html`. Category map: `schiacciate→schiacciata`, `pinsa→pinsa`, `griglia→burger` (`hotdog` for product id `hd`), `primi→primo`, default `piatto`.

- [ ] **Step 1:** Download Latin woff2 from Fontsource CDN (`https://cdn.jsdelivr.net/fontsource/fonts/bricolage-grotesque@latest/latin-{700,800}-normal.woff2`, `https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-{400,500,700}-normal.woff2`) into `public/fonts/`; add SIL OFL 1.1 text; check each file begins with `wOF2`.
- [ ] **Step 2:** `@font-face` rules + Arial-based fallback faces with `size-adjust`/`ascent-override`/`descent-override` (CLS 0).
- [ ] **Step 3:** Base CSS: tokens, reset, fluid type scale per spec §4.3, components above (visual states only), focus ring `outline: 3px solid var(--blu); outline-offset: 2px`, reduced-motion kill switch, grid 2 cols → 3 at ≥ 900 px → 4 at ≥ 1200 px.
- [ ] **Step 4:** Contrast check script (scratchpad) on every pair used: ink/cream, muted/cream, muted/white, cream/navy, navy/yellow, white/blue → all ≥ 4.5:1; adjust `--tenue` if not.
- [ ] **Step 5:** Create `public/img/og.png` (1200×630): write a scratch HTML (cream background, logo, headline in Bricolage, hamburger photo) and screenshot it at 1200×630 with Playwright; keep < 120 KB.
- [ ] **Step 6:** Commit `feat: design B foundation — fonts, illustrations, tokens`.

### Task 10: Template + server render (`server/render.js`)

**Files:**
- Create: `server/render.js`; Rewrite: `public/index.html` (template)
- Modify: `server/rotte/pubbliche.js` (`GET /`), `server/app.js` (`invalida` wiring; static cache rules)
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 9.
- Produces:
  - `creaRender({db, now, cartellaPublic}) -> {pagina() -> string, invalida()}` — caches per Rome date until `invalida()`; status badge slot recomputed per request; asset URLs get `?v=<first 8 hex of sha1(file)>`.
  - Template slots: `<!--slot:head-meta-->`, `<!--slot:stato-->`, `<!--slot:google-->`, `<!--slot:chips-->`, `<!--slot:menu-->`, `<!--slot:orari-->` (weekly hours with today highlighted + closures in the next 30 days as "Chiuso il 1/11 · Ognissanti"), `<!--slot:legale-->`, `<!--slot:dati-->` (`<script type="application/json" id="dati">` with `{oggi, orari, chiusure, impostazioni (public), prodotti: {id: {nome, prezzo_finale, finito}}}` via `jsonPerHtml`), `<!--slot:jsonld-->`, `<!--slot:demo-->`.
  - `schedaHtml(prodotto, categoria) -> string` (exported): `<article class="scheda" data-id="…">` with `<img … width="300" height="240" loading="lazy" decoding="async">` or `<svg class="scheda-ill" aria-hidden="true"><use href="icons.svg?v=…#ill-…"></use></svg>`, title, ingredients (omitted if empty), allergen line `"Allergeni: Glutine, Latte"` (+ `" · * contiene surgelati"`), `<button class="piu" type="button" aria-label="Aggiungi <nome>">+</button>`; sold-out → class `finito`, `"Finito per oggi"` label, `disabled`.
  - First 2 cards of the first category `loading="eager"`; hero image `fetchpriority="high"` + `<link rel="preload" as="image">`.
  - Static: `Cache-Control: public, max-age=31536000, immutable` when `?v=` present; HTML `no-cache`.
- Copy exactly: hero `Il pranzo <mark>a due passi</mark> dal PIN`, subtitle `Scegli, invia su WhatsApp, ritira. Bevuta e caffè compresi.`, CTA `Guarda il menù`; kickers `01 · Come funziona`, `02 · Il menù`, `03 · Dove siamo`; titles `Tre tocchi e passi a prenderlo`, `Cosa mangi oggi?` (subtitle `Prezzo unico per categoria.`); steps `Componi` / `Scegli l'ora` / `Invia su WhatsApp` with lines `Aggiungi quello che ti va`, `Quando passi a ritirare`, `Il messaggio è già pronto`; skip link `Vai al menù`; Google badge `★ 4,7 · 120 recensioni su Google` (values from settings, decimal comma).

- [ ] **Step 1: Write failing tests**

```js
test("nomi pericolosi escono come testo", () => {
  const db = dbDiProva(); db.prepare("UPDATE prodotti SET nome = ? WHERE id = 'hb'").run("<img src=x onerror=alert(1)>");
  const html = creaRender({ db, now: () => new Date("2026-10-22T12:00:00+02:00"), cartellaPublic }).pagina();
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;")); assert.ok(!html.includes("<img src=x"));
});
test("prodotto finito: disabilitato e segnato", () => {});
test("senza foto usa l'illustrazione della categoria", () => { /* sc2 → '#ill-schiacciata' */ });
test("badge stato dal fuso di Roma", () => { /* now 2026-10-24T22:30Z → "Chiuso · riapre lunedì alle 10:00" */ });
test("badge Google nascosto se manca il voto", () => {});
test("modalità demo: noindex e nastro", () => { /* <meta name="robots" content="noindex"> and "Demo — sito non ufficiale" */ });
test("la cache si svuota dopo invalida", () => {});
test("nessuno script o stile inline", () => {
  const html = creaRender(/* … */).pagina();
  assert.ok(!/<script(?![^>]*\b(src=|type="application\/(json|ld\+json)"))[^>]*>/.test(html));
  assert.ok(!/\sstyle=|\son[a-z]+=/i.test(html));
});
test("JSON-LD Restaurant", () => { /* @type Restaurant; openingHoursSpecification length 5; no aggregateRating when voto empty */ });
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** `npm run seed && npm start`; screenshots at 360/390/430/1280 px (Playwright MCP); compare to the approved mockups (`hierarchy.html` option A, `fallback-icons.html`); fix drift.
- [ ] **Step 6:** Commit `feat: server-rendered storefront in design B`.

**Milestone 2 gate:** code-review agent on M2; show screenshots to the user; apply feedback.

---

## Milestone 3 — Tray, WhatsApp, motion

### Task 11: Storefront behavior (`public/app.js`)

**Files:**
- Rewrite: `public/app.js` (`<script type="module">`)
- Modify: `public/index.html` (tray bar, tray `<dialog>`, detail `<dialog>`, live region)

**Interfaces:**
- Consumes: `#dati` (Task 10); `public/lib/{orari,whatsapp,escape,allergeni}.js`.
- Produces (DOM contract for Task 13): `#barra-vassoio` (`data-pezzi`, `.totale`), `#foglio-vassoio` with `#nome-ritiro`, `#ora-ritiro`, `#note`, `#invia-whatsapp` (`<a>` with wa.me `href`; when blocked `aria-disabled="true"` and the reason in `#motivo-blocco`), `#foglio-dettaglio`, `#annunci` (`aria-live="polite"`); event `vassoio:aggiunto` `{detail: {da: Element}}`.
- Behaviors per spec §4.4–4.5: `localStorage["cs-vassoio"]` with try/catch; on load drop unknown/finito ids → notice `"Alcuni prodotti non sono più disponibili e li abbiamo tolti dal vassoio."`; prices always from current data; fetch `/api/menu` when the tray opens (fallback to embedded data if offline); pickup select rebuilt on open and on invia; name 2–40 required → `"Scrivi il nome per il ritiro."`; block reasons in order: paused `"Ordini sospesi in questo momento."`, closed `` `Siamo chiusi — ordina ${riapre.etichetta}.` ``, no slots `"Per oggi non ci sono più orari di ritiro."`; after opening WhatsApp ask `"Messaggio pronto su WhatsApp — svuoto il vassoio?"` Sì/No; badge recomputed every 60 s; chips smooth-scroll + active chip via IntersectionObserver; header class `scorre` via IntersectionObserver on the hero; live announcement `"Aggiunto: <nome>. Vassoio: N pezzi, <euro>."`.

- [ ] **Step 1:** Implement against the contract.
- [ ] **Step 2:** Manual check in browser: add/remove, detail sheet, closed and paused states (via admin API), WhatsApp link content.
- [ ] **Step 3:** Commit `feat: tray, pickup time and WhatsApp ordering`.

### Task 12: Motion (`public/movimento.js`)

**Files:**
- Create: `public/movimento.js` (imported by `app.js`); motion rules appended to `style.css`

**Interfaces:**
- Consumes: `vassoio:aggiunto`.
- Produces: `animaAggiunta(da: Element, verso: Element)` (dot along a curve with Web Animations API, 450 ms, then bar bump), `contaFino(el, valore)` (300 ms count-up), hero entrance (`.hero.pronto` added after `document.fonts.ready`, 600 ms), "+" pop keyframes, media tilt (hover only under `(hover: hover)`, press always), status-dot pulse, sheet spring `cubic-bezier(.2,.9,.3,1.15)`. All disabled under `prefers-reduced-motion: reduce`.

- [ ] **Step 1:** Implement. **Step 2:** Verify with reduced motion on/off (DevTools emulation). **Step 3:** `gzip -c public/app.js public/movimento.js public/lib/*.js | wc -c` ≤ 12288.
- [ ] **Step 4:** Commit `feat: purposeful micro-interactions`.

### Task 13: Storefront E2E (Playwright)

**Files:**
- Create: `playwright.config.js` (projects Pixel 7 + iPhone SE; `webServer`: `node test/e2e/server-prova.js` — temp DB seeded, `creaApp` on port 3100, clock from env `ORA_PROVA` if set), `test/e2e/vetrina.spec.js`

- [ ] **Step 1: Write tests**
  - `aggiungi e invia`: 2× sc1 + 1× hb → bar "3" and "20,00 €"; name "Giulia", first time, note "senza maionese" → `#invia-whatsapp` href starts `https://wa.me/393270536624?text=` and its decoded text equals `componiMessaggio(...)` for those values (with `[DEMO] ` prefix, since demo mode is on).
  - `vassoio vecchio`: `localStorage["cs-vassoio"] = {"nonesiste":1,"hd":1,"sc1":1}` with hd finito → notice visible, only sc1 remains, total uses current price.
  - `chiuso`: `ORA_PROVA=2026-10-24T12:00:00+02:00` → badge "Chiuso · riapre lunedì alle 10:00", invia `aria-disabled="true"` with reason.
  - `orario scaduto`: open tray at 14:20 (`page.clock`), advance to 14:52, tap invia → "Per oggi non ci sono più orari di ritiro."
  - `dettaglio`: tap card body → dialog with allergen chips; Esc closes; focus back on the card.
  - `movimento ridotto`: `reducedMotion: "reduce"` → after "+", `document.getAnimations().length === 0`.
- [ ] **Step 2:** `npx playwright install chromium webkit`; `npm run test:e2e` → PASS (fix app code on failure, not the tests).
- [ ] **Step 3:** Commit `test: storefront end-to-end flows`.

**Milestone 3 gate:** code-review agent; Lighthouse mobile via the Chrome DevTools MCP on `/` → fix anything < 95.

---

## Milestone 4 — Admin

### Task 14: Admin shell, login and "Oggi" tab

**Files:**
- Rewrite: `public/admin.html`, `public/admin.css`, `public/admin.js` (module)
- Create: `public/admin/api.js`, `public/admin/ui.js`, `public/manifest.webmanifest`, `public/img/icona-192.png`, `public/img/icona-512.png` (logo-bianco on navy, padded)

**Interfaces:**
- Consumes: Tasks 6–7 API.
- Produces: `api(metodo, percorso, corpo?) -> Promise<any>` (JSON, same-origin credentials; throws `Error` with the server's `errore`, or `"Non sono riuscito a salvare. Controlla la connessione e riprova."` on network failure; on 401 shows the PIN screen); `mostraEsito(testo = "Salvato")` → toast `"Salvato · HH:MM"`; `conferma(testo) -> Promise<boolean>` (custom `<dialog>`).
- UI per spec §5: PIN screen (numeric keypad input, auto-submit on 6th digit, clear + error on failure); bottom tabs Oggi / Menù / Info; "Oggi": orders switch, closed-today toggle, primo field + Salva, finiti-oggi switches, allergen reminder banner linking to Info.

- [ ] **Step 1:** Implement. **Step 2:** Manual check at 390 px. **Step 3:** Commit `feat: admin shell and daily screen`.

### Task 15: "Menù" tab with photo capture

**Files:**
- Create: `public/admin/menu.js`, `public/admin/foto.js`

**Interfaces:**
- Produces: `preparaFoto(file: File) -> Promise<Blob>` — `createImageBitmap(file, {imageOrientation: "from-image"})`, center-crop 5:4, scale to 640×512, `canvas.toBlob(…, "image/webp", 0.82)`; if `blob.type !== "image/webp"` re-encode as `"image/jpeg"`, 0.85.
- UI per spec §5 "Menù": product editor (name, ingredients, 14 allergen checkboxes from `allergeni`, surgelati, price accepting comma, listed toggle), photo (`accept="image/*" capture="environment"`) with live preview built with the storefront `.scheda` markup/CSS, "Rimuovi foto", ↑/↓, "Aggiungi prodotto", delete via `conferma("Eliminare <nome>? Non si può annullare.")`, category editor (name, price, note, add, delete when empty).

- [ ] **Step 1:** Implement. **Step 2:** Manual check: a > 3 MB phone JPEG uploads as < 150 KB; preview matches the storefront. **Step 3:** Commit `feat: admin menu editor with phone photo capture`.

### Task 16: "Info" tab

**Files:**
- Create: `public/admin/info.js`

- [ ] **Step 1:** Implement per spec §5 "Info": hours (per day "Chiuso" toggle + two `type="time"`), closures (add `type="date"` + motivo, remove), contacts (WhatsApp "Prova" → `linkWhatsApp(numero, "Prova dal pannello di Container Serraglio")`), Google fields with help `"Apri il profilo su Google Maps: voto e numero di recensioni sono sotto il nome del locale."`, legal fields, "Allergeni verificati con la cucina", pickup settings, PIN change (attuale + nuovo), "Esci da tutti i dispositivi", last 20 accesses (it-IT date, ✓/✗, dispositivo, IP troncato), demo switch with `"Quando il locale approva il sito, spegni la modalità demo: sparisce il nastro e Google può indicizzarlo."`
- [ ] **Step 2:** Commit `feat: admin info, security and demo settings`.

### Task 17: Admin E2E

**Files:**
- Create: `test/e2e/admin.spec.js`, `test/e2e/fixture.jpg` (small real JPEG)

- [ ] **Step 1: Write tests:** wrong PIN → "PIN non valido." and field cleared; correct PIN enters; toggle hb finito → storefront card `.finito`; pause orders → storefront "Ordini sospesi in questo momento."; category price "6,50" → storefront pill "6,50 €"; upload fixture → storefront card `img[src^="foto/"]`; closed today → badge starts "Chiuso oggi"; tabs reachable by keyboard only.
- [ ] **Step 2:** `npm run test:e2e` → PASS. **Step 3:** Commit `test: admin end-to-end flows`.

**Milestone 4 gate:** code-review agent; `ecc:a11y-architect` review of storefront + admin; fix.

---

## Milestone 5 — Legal, SEO, demo mode

### Task 18: Legal pages, sitemap, robots

**Files:**
- Create: `server/legale.js`, `public/pagina.html` (template for secondary pages), `public/img/crediti.json`
- Modify: `server/rotte/pubbliche.js`, `server/render.js` (footer via `footerLegale`)
- Test: `test/legale.test.js`

**Interfaces:**
- Produces: `paginaLegale(nome: "privacy"|"allergeni"|"ordini-come"|"crediti", {impostazioni, menu, oggi}) -> string`; `footerLegale(impostazioni) -> string` (ragione_sociale, `P.IVA`, `C.F.`, `REA`, `PEC`; empty → `<span class="da-completare">dato da completare</span>`); `robotsTxt(demo: boolean) -> string`; `sitemapXml(base: string) -> string`. `crediti.json` = `[{file, titolo, autore, licenza, url_licenza, url_originale, modifiche}]` extracted from `demo/public/crediti.html`.
- Content per spec §8 (privacy sections: Titolare; Dati trattati dal sito; Vassoio e cookie tecnici; Log del server (7 giorni, IP troncato); Ordini via WhatsApp (Meta); Nessun servizio di terzi; Diritti e reclamo al Garante. Allergeni: table listed products × 14 with ✓ + traces note. Ordini-come per spec. Crediti from json). Base URL for sitemap/canonical from env `BASE_URL` (default request origin).

- [ ] **Step 1: Write failing tests:** footer shows "dato da completare" when `piva` empty, the value when set; privacy contains `titolare_trattamento` value (escaped); allergeni row for hb has ✓ under Glutine and Sesamo; `robotsTxt(true) === "User-agent: *\nDisallow: /\n"`; sitemap lists `/`, `/privacy`, `/allergeni`, `/ordini-come`; every page passes the inline-script/style regex from Task 10.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: privacy, allergen, order-terms and credits pages`.

---

## Milestone 6 — Hardening and audits

### Task 19: Cleanup and write limiter

**Files:**
- Move: `demo/public/img/p-*.webp` → `public/img/`
- Delete: `demo/`, any Outfit/Google Fonts reference, order/stock mentions in docs
- Modify: `server/app.js` (admin write limiter 300 / 15 min per session → 429 `"Troppe modifiche ravvicinate, aspetta un attimo."`)
- Test: extend `test/api-admin.test.js`

- [ ] **Step 1:** Failing test: 301st write within 15 min → 429. **Step 2:** Implement → PASS.
- [ ] **Step 3:** `grep -rn "googleapis\|gstatic\|scorte\|righe_ordine\|capienza" public server test` → no hits.
- [ ] **Step 4:** `npm audit --omit=dev` → 0 vulnerabilities.
- [ ] **Step 5:** Commit `chore: remove demo copy, add write limiter`.

### Task 20: Audits and fixes

- [ ] **Step 1:** `ecc:security-reviewer` agent on the whole repo, then the `claude-security:claude-security` scan; fix every high/medium finding, with a regression test where testable.
- [ ] **Step 2:** Lighthouse mobile on `/`, `/privacy`, `/admin` → ≥ 95 ×4; record LCP/CLS in the commit message.
- [ ] **Step 3:** `ecc:seo-specialist` agent on rendered `/`; fix.
- [ ] **Step 4:** Screenshots 360/390/430/1280 px of `/`, tray open, detail open, each admin tab → show the user.
- [ ] **Step 5:** Commit `fix: audit findings`.

---

## Milestone 7 — Deploy and handover

### Task 21: Deploy kit and tunnel sharing

**Files:**
- Create: `deploy/setup.sh`, `deploy/Caddyfile`, `deploy/container-serraglio.service`, `deploy/backup.sh`, `deploy/container-serraglio-backup.service`, `deploy/container-serraglio-backup.timer`, `deploy/update.sh`, `deploy/LEGGIMI.md`, `scripts/condividi.js`
- Modify: `package.json` (`"condividi": "node scripts/condividi.js"`), `avvia.sh`, `server/server.js` (env `FOTO_DIR`, `BASE_URL`)

**Interfaces:**
- `setup.sh DOMINIO` (Debian 12, root, once): user `serraglio`; `/srv/container-serraglio/{app,dati,backup}`; Node LTS (NodeSource), Caddy (official repo), ufw 22/80/443, fail2ban, unattended-upgrades, sqlite3; disables SSH password auth only if an authorized key exists; installs units; prints next steps.
- Unit: `User=serraglio`, `WorkingDirectory=/srv/container-serraglio/app`, `Environment=NODE_ENV=production PORT=3000 DB_PATH=/srv/container-serraglio/dati/container.db FOTO_DIR=/srv/container-serraglio/dati/foto BASE_URL=https://DOMINIO`, `ExecStart=/usr/bin/node server/server.js`, `NoNewPrivileges=yes ProtectSystem=strict ProtectHome=yes PrivateTmp=yes ReadWritePaths=/srv/container-serraglio/dati`, `Restart=on-failure`.
- Caddyfile: site `{$DOMINIO}` with `encode zstd gzip`, `header Strict-Transport-Security "max-age=31536000; includeSubDomains"`, `reverse_proxy 127.0.0.1:3000`, access log to `/var/log/caddy/serraglio.log` with `roll_keep_for 168h` and `format filter { request>remote_ip ip_mask 24 48 }`; `www.{$DOMINIO}` redirects to apex.
- `backup.sh`: `sqlite3 dati/container.db ".backup backup/db-$(date +%F).db"`, tarball of `dati/foto`, delete files older than 14 days; daily timer 03:30.
- `update.sh HOST DOMINIO` (run from maintainer PC): over ssh — save current commit, `git pull --ff-only`, `npm ci --omit=dev`, `npm test`, restart; poll `https://DOMINIO/salute` 10× every 2 s; on failure checkout saved commit, `npm ci --omit=dev`, restart, exit 1. (Tests need dev deps only for e2e; unit tests run with `node --test` and no dev deps.)
- `scripts/condividi.js`: spawns `cloudflared tunnel --url http://localhost:${PORT || 3000}`, prints the `trycloudflare.com` URL from its output; if missing, prints `winget install Cloudflare.cloudflared` (Windows) / `pkg install cloudflared` (Termux).

- [ ] **Step 1:** Write files; `bash -n` each script; `caddy fmt --diff` if Caddy is available (else rely on the Docker rehearsal).
- [ ] **Step 2:** Rehearse in Docker `debian:12`: run `setup.sh example.test` with systemd steps skipped via `SENZA_SYSTEMD=1`, start the app with node, `curl localhost:3000/salute` → `{"ok":true}`; run `backup.sh` → files created.
- [ ] **Step 3:** Commit `feat: VPS deploy kit and tunnel sharing`.

### Task 22: Documentation and handover

**Files:**
- Rewrite: `README.md` (Italian: quick start, `npm run condividi`, structure, tests, deploy summary → `deploy/LEGGIMI.md`)
- Create: `docs/guida-rapida.md` + `docs/guida-rapida.pdf` (via `anthropic-skills:pdf`, screenshots from Task 20), `docs/consegna.md` (checklist: domain + VPS in owner's name; change PIN; fill legal data; verify allergens with kitchen; accountant reviews policy; replace stand-in photos → remove credits; switch off demo mode; UptimeRobot on `/salute`; maintenance contract outline)

- [ ] **Step 1:** Write docs. **Step 2:** `npm test && npm run test:e2e` → all green.
- [ ] **Step 3:** Whole-branch review by a fresh reviewer agent (most capable model); fix findings.
- [ ] **Step 4:** Commit `docs: README, owner quick guide and handover checklist`.
