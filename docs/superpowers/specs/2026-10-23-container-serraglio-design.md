# Container Serraglio — redesign spec

Date: 2026-10-23 · Status: awaiting review

## 1. Goal and context

A website to **pitch to the owner** of Container Serraglio (street-food container
next to the PIN university campus, Prato). It must be production-grade in UI,
backend, security and legal compliance, so the owner can say yes and go live
without further work.

- **Customers:** mostly PIN students, on phones, often on weak 4G.
- **Flow (Hybrid):** browse menu → build a tray → pick a pickup time → tap
  "Invia su WhatsApp" → a pre-filled message opens in WhatsApp to the shop →
  student picks up and pays at the counter. The server never receives or
  stores orders. No post-order features (no notifications, no tracking).
- **Owner:** not tech-savvy. Uses the admin from a phone, standing, one hand.
- **Language:** Italian only.
- **Success criteria:**
  - Lighthouse mobile ≥ 95 in all four categories; LCP < 1.8 s, CLS = 0 on
    emulated mid-range Android / 4G.
  - Owner can do the daily routine (primo del giorno, sold-out, pause orders,
    closed today) in under 30 seconds without help.
  - No personal data of customers stored server-side; no cookie banner needed.
  - Passes automated tests, a security review agent pass and a Claude
    Security scan with no open high/medium findings.

### Non-goals

- Online payment, order storage, stock counting, pickup-slot capacity.
- Notifications of any kind, order tracking, customer accounts.
- English version.
- Reproducing Google review texts (Google ToS / copyright / GDPR).
- Building design direction A now. A ("menu board": dark, typographic list)
  remains a documented alternative to switch to *only* if good product photos
  cannot be obtained. It is not mixed into B.

## 2. Architecture

Evolve the existing stack: **Node ≥ 20, Express 4, better-sqlite3, vanilla
JS/CSS, no build step, no frontend framework.** Runtime dependencies stay at
two (express, better-sqlite3). Runs identically on a PC, Termux, or a VPS.

```
server/
  server.js      app setup, security headers, route mounting, static files
  db.js          connection, schema, data access helpers
  auth.js        PIN, sessions, rate limiting, origin check (split out of server.js)
  render.js      NEW: fills public/index.html template with menu/status/hours
  orari.js       NEW: open/closed status, pickup times, closures (pure functions)
  foto.js        NEW: upload validation + storage
  legale.js      NEW: renders privacy / allergeni / condizioni pages from settings
  schema.sql · seed.js
public/
  index.html     template with <!--slot:...--> markers
  app.js         tray, pickup time, WhatsApp message, detail sheet, motion
  whatsapp.js    NEW: pure message builder (shared by browser and tests)
  style.css
  admin.html · admin.js · admin.css · manifest.webmanifest
  fonts/         Bricolage Grotesque + DM Sans, woff2, Latin subset, self-hosted
  img/           logos, stand-in product photos
  icons.svg      category illustrations as <symbol>s
deploy/          Caddyfile, systemd unit, setup.sh, backup.sh, update.sh
test/            node --test unit/API tests; e2e/ Playwright specs
docs/            spec, plan, owner quick guide
```

Each new server module is a small unit with one purpose; `orari.js` and
`whatsapp.js` are pure (no I/O) so they are easy to test.

**Time zone:** every "today", open/closed and pickup computation uses
**Europe/Rome** explicitly (via `Intl.DateTimeFormat` with `timeZone`), never
the host's local time — a VPS normally runs in UTC. `orari.js` functions take
`now` as a parameter so tests can pin any instant (incl. DST changes). The
browser uses the same functions with the same explicit time zone.

The old `demo/` folder (GSAP/Lenis animated copy) is **removed** once the new
storefront supersedes it; its credited Wikimedia photos move to `public/img/`
together with the credits.

## 3. Data model

Kept: `categorie`, `prodotti`, `orari`, `impostazioni`, `utenti`, `sessioni`.

Removed: `ordini`, `righe_ordine`, `scorte`, and every route, helper and
scheduled job that used them.

Changes:

- `prodotti`
  - `allergeni` becomes a comma-separated list of **codes** from the fixed EU
    list of 14 (`glutine, crostacei, uova, pesce, arachidi, soia, latte,
    frutta_guscio, sedano, senape, sesamo, solfiti, lupini, molluschi`). The
    server rejects unknown codes. Labels live in one shared table.
  - `surgelati INTEGER NOT NULL DEFAULT 0` — contains frozen ingredients (*).
  - `finito_il TEXT NULL` — date (AAAA-MM-GG) the product was marked sold-out.
    A product is sold-out **only on that date**; it is automatically available
    again the next day without any job. Replaces daily use of `disponibile`.
  - `disponibile` stays as "listed on the menu at all" (hide without deleting).
- `chiusure` NEW: `data TEXT PRIMARY KEY, motivo TEXT NOT NULL DEFAULT ''` —
  one-off closing days.
- `sessioni`: column `token` stores **SHA-256 of the token**, not the token;
  add `creato_il`, `ultimo_uso`, `dispositivo` (short UA summary).
- `accessi` NEW: login attempt log — `quando, esito ('ok'|'ko'), dispositivo,
  ip_troncato` (IPv4 /24, IPv6 /48). Rows older than 30 days are deleted.
- `impostazioni` new keys: `google_voto` (e.g. "4.7"), `google_recensioni`
  (int), `google_aggiornato` (auto date), `google_link`, `rea`,
  `allergeni_verificati` ('0'/'1'), `modalita_demo` ('1' until handover),
  `anticipo_minimo` (default 15), `passo_fascia` (default 10).
  Removed keys: `capienza_fascia`, `giorni_conservazione`.

Migration: `schema.sql` creates the new shape; `seed.js` loads the real menu
(with allergen codes) for the demo. There is no production data yet, so a
fresh database is acceptable; no migration script for old data.

## 4. Storefront

### 4.1 Rendering

`GET /` → `render.js` fills `public/index.html` slots (menu, status, hours,
rating, footer legal data, JSON-LD) with **every value HTML-escaped**. The
result is cached in memory and invalidated by any admin write. The browser
gets complete HTML on first byte; `app.js` (target ≤ 12 KB gzip) enhances it.
The open/closed badge is also recomputed client-side every minute from the
hours embedded as JSON, so a cached page never shows a stale status.

`GET /api/menu` remains (JSON) for the client to refresh sold-out state when
the tray opens.

### 4.2 Page structure (single page)

1. **Header** — logo, links "Menù", "Dove siamo", compact "Ordina". Gains a
   shadow/compacts after scrolling past the hero (the only scroll-linked effect).
2. **Hero** — status badge ("● Aperto · fino alle 15:00" / "Chiuso · riapre
   lunedì alle 10:00" / "Chiuso oggi"), headline "Il pranzo *a due passi* dal
   PIN" with highlighter, subtitle, "Guarda il menù" CTA, Google badge
   "★ 4,7 · 120 recensioni su Google" linking to `google_link` (hidden if
   empty).
3. **01 · Come funziona** — dark navy band, three numbered steps.
4. **02 · Il menù** — "Cosa mangi oggi?"; sticky category chips (jump links,
   active chip follows scroll via IntersectionObserver); per category: header
   with solid rule + yellow price pill + note; **2-column grid** of cards.
5. **03 · Dove siamo** — address, weekly hours with today highlighted,
   upcoming closures, "Apri in Maps" (link, no embed), phone, Instagram.
6. **Footer** — legal data (ragione sociale, P.IVA, C.F., REA, PEC),
   links: Privacy e cookie, Allergeni, Come funzionano gli ordini, Crediti foto.

### 4.3 Visual system

- Background `#F4F1EA` (warm cream), cards `#FFFFFF`, ink `#111A2B`, muted
  `#56637A`, navy `#0B1C2E`, brand blue `#1F4C98`, yellow `#FFC42E`.
  All text/background pairs ≥ 4.5:1 (WCAG AA).
- Type: **Bricolage Grotesque** (800 headings, 700 category/card titles) +
  **DM Sans** (400/500/700 body). Self-hosted woff2, Latin subset,
  `font-display: swap`, size-adjusted fallbacks to avoid layout shift.
- Hierarchy: hero h1 (≈36–56 px fluid) → section h2 with numbered kicker
  "0N · Nome" + yellow dash (≈32–44 px) → category h3 (≈22–26 px) with solid
  2 px rule beneath and price pill on the right → card title (≈15 px).
- **Card:** photo (or category SVG on a cream "plate") 1:1-ish area, name,
  full ingredients (wraps; never truncated), allergen line in small muted
  text, "+" button bottom-right. Sold-out: 50% opacity, "Finito per oggi"
  label, "+" disabled.
- **No-photo fallback:** per-category line illustrations (schiacciata, pinsa,
  burger, hot dog, primo; plus a generic plate) in navy stroke + yellow fill,
  refined as one matched set, inlined via `icons.svg` `<use>`.
- Desktop (≥ 900 px): 3–4 column grid, hero two columns; still single page.

### 4.4 Detail sheet

Tapping a card (not the "+") opens a `<dialog>` bottom sheet: large photo or
illustration, name, price, ingredients, allergen chips, frozen note,
quantity stepper, "Aggiungi al vassoio".

### 4.5 Tray and WhatsApp

- Tray state `{productId: qty}` in `localStorage` (`cs-vassoio`), all access
  wrapped in try/catch; on load, entries for unknown/sold-out products are
  dropped with a visible notice.
- Sticky bottom bar: "Vassoio · N · € tot · Ordina →" (hidden when empty).
- Tray sheet: line items with steppers, **Nome per il ritiro** (2–40 chars,
  required), **Ora di ritiro** (select), **Note** (≤ 200 chars), total,
  "Invia su WhatsApp".
- Pickup times (`orari.js`, also bundled for the browser): from
  `max(now + anticipo_minimo, opening)` rounded up to `passo_fascia`, until
  `closing − passo_fascia`, **today only**. If none remain or the shop is
  closed / orders paused, the button is disabled with the reason ("Ordini
  sospesi in questo momento", "Siamo chiusi — ordina da lunedì alle 10:00").
- Message (`whatsapp.js`), e.g.:
  ```
  Ciao! Ordine per il ritiro alle 13:10
  Nome: Giulia
  • 2× Container Serraglio 1 — 12,00 €
  • 1× Hamburgher — 8,00 €
  Totale: 20,00 € (pago al ritiro)
  Note: senza maionese
  ```
  Opened as `https://wa.me/<digits>?text=<encodeURIComponent>`. User input is
  stripped of control characters and WhatsApp formatting characters
  (`* _ ~ \``) to keep the message clean. After opening, the tray shows
  "Messaggio pronto su WhatsApp — svuoto il vassoio?" with Sì / No.
- If `modalita_demo = 1`, the message is prefixed "[DEMO]".

### 4.6 Motion

Total motion code ≈ 1–2 KB; GSAP, ScrollTrigger and Lenis are dropped.

- "+" press: button pop (scale 1→1.25→1, 300 ms), a dot flies along a curve
  to the tray bar (Web Animations API), tray total counts up.
- Hero entrance once on load (≈600 ms): headline words rise/fade, photo
  settles.
- Card media tilt on hover (pointer devices) / press.
- Status dot gentle pulse when open.
- Sheets slide up with a spring-like `cubic-bezier`; chip jumps use native
  smooth scroll.
- **Not allowed:** scroll-triggered reveals, scroll hijacking, parallax,
  marquee/infinite scroll, cursor followers.
- `prefers-reduced-motion: reduce` → all of the above become instant.

### 4.7 Performance budget

- HTML + CSS + JS ≤ 60 KB gzip; fonts ≈ 45 KB; no third-party requests.
- Product images: WebP, two widths (320/640) via `srcset`/`sizes`, explicit
  `width`/`height`, `loading="lazy"` + `decoding="async"` except the first
  row; hero image `fetchpriority="high"` and preloaded.
- Compression (gzip/zstd) by Caddy in production. Static assets get
  `Cache-Control: public, max-age=31536000, immutable` via a `?v=<hash>`
  query appended by `render.js`; HTML gets `no-cache`.

### 4.8 SEO and sharing

`<title>`, meta description, canonical, Open Graph + Twitter card with a
1200×630 image, JSON-LD `Restaurant` (name, address, geo, hours, servesCuisine,
menu URL, priceRange, telephone; `aggregateRating` **only if** rating fields
are filled), `sitemap.xml`, `robots.txt`. While `modalita_demo = 1`:
`<meta name="robots" content="noindex">`, `robots.txt` disallows all, and a
visible "Demo — sito non ufficiale" ribbon is shown.

### 4.9 Accessibility

WCAG 2.2 AA: contrast, 44×44 px minimum targets, visible focus, skip link,
semantic landmarks and heading order, `<dialog>` with focus management and
Esc to close, `aria-live` announcement on tray changes ("Aggiunto: Bisenzio.
Vassoio: 3 pezzi, 18 €"), descriptive labels on "+" buttons, form errors tied
to fields with `aria-describedby`, `lang="it"`.

## 5. Admin panel (`/admin`)

Phone-first, 18 px base text, ≥ 56 px controls, bottom tab bar, plain Italian,
no hidden gestures, `noindex`. Installable via `manifest.webmanifest` (icon,
standalone). Same visual system as the storefront.

**Login:** 6-digit numeric PIN, auto-submit on the 6th digit. Session 30 days,
sliding.

**Tab "Oggi"**
- Big switch "Ordini dal sito: ATTIVI / IN PAUSA".
- "Oggi siamo chiusi" (adds today to `chiusure`; becomes "Riapri oggi").
- Primo del giorno: one field + "Salva".
- Finiti oggi: switch per product (sets/clears `finito_il = today`).
- Reminder banner while `allergeni_verificati = 0`.

**Tab "Menù"**
- Products grouped by category; tap to edit: name (2–60), ingredients
  (≤ 200), 14 allergen checkboxes, "contiene surgelati", price (blank =
  category price; accepts "6,50"), listed on menu (on/off).
- Photo: "Scatta o scegli foto" (`<input type=file accept=image/*
  capture=environment>`), client-side center-crop + resize to 640 px and
  320 px WebP via canvas (quality 0.82), live card preview, upload;
  "Rimuovi foto" returns to the illustration.
- ↑ / ↓ reorder buttons; "Aggiungi prodotto"; "Elimina" with a confirmation
  dialog naming the product.
- Category: name, price, note; add category; delete only when empty.

**Tab "Info"**
- Weekly hours (open/close per day, or "chiuso"); closures list with add
  (date + optional reason) / remove.
- Contacts: telefono, WhatsApp (digits, with country code; "Prova" button
  opens a test `wa.me` link), Instagram, Facebook, indirizzo, email.
- Google: voto, numero recensioni, link (with "Dove trovo questi dati?" help).
- Dati legali: ragione sociale, P.IVA, C.F., REA, PEC, titolare del
  trattamento; "Allergeni verificati con la cucina" checkbox.
- Pickup settings: anticipo minimo, intervallo orari.
- Sicurezza: cambia PIN (signs out other devices), "Esci da tutti i
  dispositivi", "Ultimi accessi" list (last 20).
- Demo mode switch (removes ribbon + noindex) — shown with an explanation.

**Feedback:** switches save immediately; forms have one "Salva" and show
"Salvato · 10:14"; errors in plain words next to the field; network failure
shows "Non sono riuscito a salvare. Controlla la connessione e riprova."
and keeps the user's input.

**Deliverable:** `docs/guida-rapida.md` (+ printable PDF) — one page with
screenshots of the daily routine.

## 6. API

Public:
- `GET /` (rendered page), `GET /privacy`, `/allergeni`, `/ordini-come`,
  `/crediti` (rendered from settings), `GET /api/menu`, `GET /foto/:file`,
  `GET /sitemap.xml`, `GET /robots.txt`, `GET /salute` (health check:
  200 + DB ping).

Admin (all require session; all writes require same-origin + JSON):
- `POST /api/admin/login`, `POST /api/admin/logout`,
  `POST /api/admin/logout-tutti`, `GET /api/admin/stato`,
  `POST /api/admin/pin`, `GET /api/admin/accessi`
- `GET /api/admin/menu`
- `POST|PATCH|DELETE /api/admin/prodotti[/:id]`,
  `POST /api/admin/prodotti/:id/sposta` (`{direzione: "su"|"giu"}`),
  `PUT /api/admin/prodotti/:id/finito` (`{finito: bool}`),
  `PUT|DELETE /api/admin/prodotti/:id/foto` (raw image body, ≤ 3 MB)
- `POST|PATCH|DELETE /api/admin/categorie[/:id]`
- `PUT /api/admin/orari`, `POST|DELETE /api/admin/chiusure[/:data]`
- `PATCH /api/admin/impostazioni` (allow-listed keys, per-key validators)
- `PUT /api/admin/primo`

Errors: JSON `{errore: "<frase in italiano>"}` with 400/401/403/404/409/413/429.
Unknown fields are ignored; every value is validated per field.

## 7. Security

- **PIN:** scrypt + per-user salt, constant-time compare (existing).
  Rejects trivial PINs (same digit, sequences). Server refuses to start in
  production while the PIN is still the seed default.
- **Rate limits** (in memory): login 5 / 15 min per IP; **global** 30 failed
  logins / hour → new logins paused for 1 hour (existing sessions keep
  working); uploads 30 / hour per session; all admin writes 300 / 15 min.
- **Sessions:** 32-byte random token, stored as SHA-256; cookie
  `__Host-sessione`, `HttpOnly; Secure; SameSite=Strict; Path=/`, 30-day
  sliding expiry; regenerated on login; PIN change and "esci da tutti"
  delete all other sessions. In dev over plain http the cookie falls back to
  `sessione` without `Secure`/`__Host-` (only when `NODE_ENV !== production`).
- **CSRF:** SameSite=Strict + `Origin`/`Sec-Fetch-Site` check on every
  non-GET + `Content-Type: application/json` required (except photo upload,
  which requires `image/*` and the same checks).
- **Output encoding:** single `escapeHtml` used by `render.js`/`legale.js`;
  client inserts text with `textContent` or the same escaper. JSON embedded in
  HTML is serialized with `<`, `>`, `&`, U+2028/9 escaped.
- **Input validation:** lengths, numeric ranges, dates `AAAA-MM-GG` that are
  real dates, times `HH:MM`, WhatsApp `^\d{8,15}$`, URLs must be `https:` and
  host in {instagram.com, facebook.com, google.com, g.page,
  maps.app.goo.gl} (incl. `www.`), allergen codes from the fixed list.
- **Headers:** CSP `default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
  object-src 'none'; base-uri 'none'; form-action 'self';
  frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`;
  `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy:
  camera=(self), microphone=(), geolocation=()`; HSTS (Caddy, prod);
  `x-powered-by` disabled. No inline scripts or styles (JSON data uses
  `<script type="application/json">`, which CSP does not execute).
- **Uploads:** ≤ 3 MB, magic-byte check (JPEG/PNG/WebP only; SVG rejected),
  dimensions read from header and capped (≤ 4000 px), stored as
  `dati/foto/<random 16 hex>.<ext>` outside `public/`, served by a route that
  sets `Content-Type` from the stored type, `nosniff`, and long cache. Old file
  deleted when replaced.
- **Errors:** generic messages to clients; details only in server logs;
  no stack traces in production.
- **Dependencies:** only express + better-sqlite3 at runtime; `npm audit` in
  the update script; lockfile committed.
- **Server hardening (deploy kit):** dedicated user, systemd sandboxing
  (`NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths=` data dir,
  `PrivateTmp`), UFW 22/80/443, SSH keys only, fail2ban, unattended-upgrades.

## 8. Legal (Italy / EU)

- **Privacy & cookie policy** page generated from settings: controller
  identity; the site stores no customer data; `localStorage` tray and admin
  session cookie are technical (no consent needed per Garante guidelines
  10/06/2021); server logs with truncated IP kept 7 days; **WhatsApp**: data
  the user sends goes via Meta to the shop's phone, controller is the shop,
  suggested retention 30 days, Meta's own policy applies; no third-party
  services on the site; data subject rights and Garante complaint contact.
- **No cookie banner**, because nothing non-technical is used.
- **Business info** (DPR 633/72 art. 35; D.Lgs 70/2003 art. 7) in the footer
  of every page. Empty fields render a visible "dato da completare" placeholder
  — never invented values.
- **Food information** (Reg. UE 1169/2011 art. 9, 14, 44): allergens shown per
  product before ordering; `/allergeni` page with full table and
  cross-contamination note; frozen-ingredient marker (*). Admin reminder until
  `allergeni_verificati = 1`. Seed allergen data is labeled as example data.
- **Order conditions** page `/ordini-come`: order accepted when the shop
  replies on WhatsApp; payment at pickup; prices include VAT; no right of
  withdrawal for perishable goods (D.Lgs 206/2005 art. 59 c.1 lett. d);
  cancel by message.
- **Truthful claims:** Google badge shows "aggiornato il <data>" set
  automatically on edit; JSON-LD rating only when filled.
- **Photo credits** page for Wikimedia stand-in photos (CC BY / BY-SA),
  removed when the owner's photos replace them.
- **Demo mode** (pre-sale): ribbon + noindex + "[DEMO]" WhatsApp prefix.
- Accessibility: built to WCAG 2.2 AA (EAA exempts micro-enterprises, but we
  meet it anyway).
- Delivery checklist item: owner's accountant reviews legal data and policy.
  We are not lawyers.

## 9. Hosting and operations

**Pitch phase (free):** `npm start` locally; `npm run condividi` starts a
Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:3000`)
and prints the https URL. Existing `avvia.sh` (Termux) kept and updated.

**Production (after sale):** VPS (Debian 12, ≈ €4/month), domain in the
owner's name. `deploy/`:
- `setup.sh` — one-time: user, UFW, fail2ban, unattended-upgrades, Node LTS,
  Caddy, systemd unit, data dir, backup timer.
- `Caddyfile` — domain, automatic HTTPS, HSTS, zstd/gzip, access log with IP
  truncation, 7-day log rotation, reverse proxy to `127.0.0.1:3000`.
- `container-serraglio.service` — sandboxed systemd unit, `NODE_ENV=production`.
- `backup.sh` — daily `sqlite3 .backup` + photos tarball, 14 days kept,
  weekly copy pulled to the maintainer's machine via `rsync` over SSH.
- `update.sh` — run from maintainer's PC: SSH → `git pull` → `npm ci
  --omit=dev` → `npm test` → restart → poll `/salute`; on failure, checkout
  previous commit and restart.
- Uptime monitoring: free external ping on `/salute`.
- `docs/consegna.md` — handover: accounts in owner's name, how to reach the
  maintainer, maintenance contract template outline.

## 10. Testing

- **Unit (node --test):** `orari.js` (open/closed, next opening, pickup times
  incl. near closing, midnight, closures, closed days), `whatsapp.js`
  (formatting, totals, sanitising), escaping, allergen validation, upload
  magic bytes.
- **API (node --test + temporary DB file):** every admin route: auth required,
  origin check, validation errors, rate limits, session hashing, PIN change
  invalidation, cache invalidation of the rendered page.
- **E2E (Playwright, Pixel 7 + iPhone SE viewports):** browse → add → detail
  sheet → tray → pickup time → WhatsApp link content; closed/paused states;
  admin login → toggle sold-out → visible on site; photo upload; reduced
  motion.
- **Audits:** Lighthouse mobile (targets in §1), axe accessibility, security
  review agent + Claude Security scan, SEO agent pass.
- Screenshots at 360, 390, 430 px and 1280 px for review.

## 11. Milestones

1. Backend cleanup: remove orders/stock, new schema, module split, tests.
2. Server-rendered storefront in design B (static content, no tray).
3. Tray, detail sheet, pickup times, WhatsApp, motion.
4. Admin redesign, photo upload, closures, access log.
5. Legal pages, SEO, demo mode.
6. Security hardening, full test suite, audits and fixes.
7. Deploy kit, owner quick guide, handover docs.

Each milestone ends runnable, reviewed by a code-review agent, and shown to
the user before the next starts.
