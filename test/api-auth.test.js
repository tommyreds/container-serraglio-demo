import { test } from "node:test";
import assert from "node:assert/strict";
import { avviaProva, PIN_PROVA } from "./aiuto.js";

test("login giusto imposta cookie HttpOnly SameSite=Strict", async () => {
  const p = await avviaProva();
  const r = await p.richiesta("POST", "/api/admin/login", { corpo: { pin: PIN_PROVA } });
  assert.equal(r.stato, 200);
  const cookie = r.intestazioni.get("set-cookie");
  assert.match(cookie, /^sessione=[0-9a-f]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000$/);
  assert.equal(p.db.prepare("SELECT esito FROM accessi ORDER BY id DESC").get().esito, "ok");
  await p.chiudi();
});

test("in produzione il cookie è __Host- e Secure", async () => {
  const p = await avviaProva({ produzione: true });
  const r = await p.richiesta("POST", "/api/admin/login", { corpo: { pin: PIN_PROVA } });
  assert.match(r.intestazioni.get("set-cookie"), /^__Host-sessione=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Strict; Path=\//);
  await p.chiudi();
});

test("PIN sbagliato: 401 e accesso registrato come ko", async () => {
  const p = await avviaProva();
  const r = await p.richiesta("POST", "/api/admin/login", { corpo: { pin: "000000" } });
  assert.equal(r.stato, 401);
  assert.equal(r.json.errore, "PIN non valido.");
  assert.equal(p.db.prepare("SELECT esito FROM accessi ORDER BY id DESC").get().esito, "ko");
  await p.chiudi();
});

test("sesto tentativo dallo stesso IP: 429 anche con il PIN giusto", async () => {
  const p = await avviaProva();
  for (let i = 0; i < 5; i++) assert.equal((await p.richiesta("POST", "/api/admin/login", { corpo: { pin: "000000" } })).stato, 401);
  const r = await p.richiesta("POST", "/api/admin/login", { corpo: { pin: PIN_PROVA } });
  assert.equal(r.stato, 429);
  assert.equal(r.json.errore, "Troppi tentativi. Riprova fra un quarto d'ora.");
  await p.chiudi();
});

test("stato e logout", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  assert.deepEqual((await p.richiesta("GET", "/api/admin/stato", { cookie: c })).json, { utente: "banco" });
  assert.equal((await p.richiesta("POST", "/api/admin/logout", { cookie: c })).stato, 200);
  assert.equal((await p.richiesta("GET", "/api/admin/stato", { cookie: c })).stato, 401);
  await p.chiudi();
});

test("senza sessione: 401 con messaggio", async () => {
  const p = await avviaProva();
  const r = await p.richiesta("GET", "/api/admin/stato");
  assert.equal(r.stato, 401);
  assert.equal(r.json.errore, "Sessione scaduta, rifai l'accesso.");
  await p.chiudi();
});

test("scrittura da altra origine: 403", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  const r = await p.richiesta("POST", "/api/admin/logout", { cookie: c, origine: "https://evil.example" });
  assert.equal(r.stato, 403);
  assert.equal(r.json.errore, "Richiesta non consentita.");
  await p.chiudi();
});

test("login senza Origin: 403", async () => {
  const p = await avviaProva();
  assert.equal((await p.richiesta("POST", "/api/admin/login", { corpo: { pin: PIN_PROVA }, origine: null })).stato, 403);
  await p.chiudi();
});

test("scrittura senza JSON: 415", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  const r = await p.richiesta("POST", "/api/admin/logout", { cookie: c, tipo: "text/plain" });
  assert.equal(r.stato, 415);
  assert.equal(r.json.errore, "Formato non valido.");
  await p.chiudi();
});

test("JSON malformato: 400", async () => {
  const p = await avviaProva();
  const r = await p.richiesta("POST", "/api/admin/login", { grezzo: "{nope", tipo: "application/json" });
  assert.equal(r.stato, 400);
  await p.chiudi();
});

test("cambio PIN chiude le altre sessioni", async () => {
  const p = await avviaProva();
  const c1 = await p.accedi();
  const c2 = await p.accedi();
  const r = await p.richiesta("POST", "/api/admin/pin", { cookie: c1, corpo: { attuale: PIN_PROVA, nuovo: "730194" } });
  assert.equal(r.stato, 200);
  assert.equal((await p.richiesta("GET", "/api/admin/stato", { cookie: c2 })).stato, 401);
  assert.equal((await p.richiesta("GET", "/api/admin/stato", { cookie: c1 })).stato, 200);
  await p.accedi("730194");
  await p.chiudi();
});

test("cambio PIN: attuale sbagliato o nuovo banale", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  assert.equal((await p.richiesta("POST", "/api/admin/pin", { cookie: c, corpo: { attuale: "000000", nuovo: "730194" } })).stato, 401);
  const r = await p.richiesta("POST", "/api/admin/pin", { cookie: c, corpo: { attuale: PIN_PROVA, nuovo: "123456" } });
  assert.equal(r.stato, 400);
  assert.equal(r.json.errore, "Scegli un PIN meno prevedibile: niente cifre uguali o in sequenza.");
  await p.chiudi();
});

test("esci da tutti i dispositivi", async () => {
  const p = await avviaProva();
  const c1 = await p.accedi();
  const c2 = await p.accedi();
  assert.equal((await p.richiesta("POST", "/api/admin/logout-tutti", { cookie: c1 })).stato, 200);
  assert.equal((await p.richiesta("GET", "/api/admin/stato", { cookie: c1 })).stato, 401);
  assert.equal((await p.richiesta("GET", "/api/admin/stato", { cookie: c2 })).stato, 401);
  await p.chiudi();
});

test("ultimi accessi", async () => {
  const p = await avviaProva();
  await p.richiesta("POST", "/api/admin/login", { corpo: { pin: "000000" } });
  const c = await p.accedi();
  const r = await p.richiesta("GET", "/api/admin/accessi", { cookie: c });
  assert.deepEqual(r.json.accessi.map(a => a.esito), ["ok", "ko"]);
  assert.equal(r.json.accessi[0].ip_troncato, "127.0.0.0");
  await p.chiudi();
});

test("salute e menù pubblico", async () => {
  const p = await avviaProva({ now: () => new Date("2026-10-22T12:00:00+02:00") });
  assert.deepEqual((await p.richiesta("GET", "/salute")).json, { ok: true });
  const m = (await p.richiesta("GET", "/api/menu")).json;
  assert.equal(m.oggi, "2026-10-22");
  assert.equal(m.categorie.length, 4);
  assert.equal(m.orari.length, 7);
  assert.deepEqual(m.chiusure, []);
  assert.equal(m.impostazioni.whatsapp, "393270536624");
  await p.chiudi();
});

test("intestazioni di sicurezza", async () => {
  const p = await avviaProva();
  const r = await p.richiesta("GET", "/salute");
  const csp = r.intestazioni.get("content-security-policy");
  assert.match(csp, /default-src 'self'; script-src 'self'; style-src 'self'/);
  assert.match(csp, /object-src 'none'; base-uri 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.intestazioni.get("x-content-type-options"), "nosniff");
  assert.equal(r.intestazioni.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(r.intestazioni.get("permissions-policy"), "camera=(self), microphone=(), geolocation=()");
  assert.equal(r.intestazioni.get("x-powered-by"), null);
  await p.chiudi();
});

test("API inesistente: 404 JSON", async () => {
  const p = await avviaProva();
  const r = await p.richiesta("GET", "/api/boh");
  assert.equal(r.stato, 404);
  assert.equal(r.json.errore, "Risorsa non trovata.");
  await p.chiudi();
});

/* ---------- dalla revisione della fase 1 ---------- */

test("cambio PIN: tentativi sul PIN attuale limitati e registrati", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  for (let i = 0; i < 5; i++) {
    assert.equal((await p.richiesta("POST", "/api/admin/pin", { cookie: c, corpo: { attuale: "000000", nuovo: "730194" } })).stato, 401);
  }
  const r = await p.richiesta("POST", "/api/admin/pin", { cookie: c, corpo: { attuale: PIN_PROVA, nuovo: "730194" } });
  assert.equal(r.stato, 429);
  assert.equal(p.db.prepare("SELECT COUNT(*) n FROM accessi WHERE esito = 'ko'").get().n, 5);
  await p.chiudi();
});

test("il pannello si apre su /admin, non indicizzato", async () => {
  const p = await avviaProva();
  const r = await fetch(p.base + "/admin");
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  assert.ok(html.includes('rel="manifest"'));
  assert.equal((await fetch(p.base + "/manifest.webmanifest")).status, 200);
  await p.chiudi();
});

test("le risposte del pannello non finiscono nella cache del browser", async () => {
  const p = await avviaProva();
  const c = await p.accedi();
  assert.equal((await p.richiesta("GET", "/api/admin/menu", { cookie: c })).intestazioni.get("cache-control"), "no-store");
  await p.chiudi();
});

test("/sessione dice se si è dentro senza errori in console", async () => {
  const p = await avviaProva();
  assert.deepEqual((await p.richiesta("GET", "/api/admin/sessione")).json, { dentro: false });
  const c = await p.accedi();
  assert.deepEqual((await p.richiesta("GET", "/api/admin/sessione", { cookie: c })).json, { dentro: true });
  await p.chiudi();
});

/* ---------- dalla revisione di sicurezza ---------- */

test("senza proxy fidato, X-Forwarded-For non aggira il limite per IP", async () => {
  const p = await avviaProva({ trustProxy: false });
  const { request } = await import("node:http");
  const prova = n => new Promise((ok, ko) => {
    const r = request(`${p.base}/api/admin/login`, { method: "POST", headers: {
      Origin: p.base, "Content-Type": "application/json", "X-Forwarded-For": `9.9.9.${n}` } }, res => { res.resume(); ok(res.statusCode); });
    r.on("error", ko); r.end(JSON.stringify({ pin: "000000" }));
  });
  for (let i = 0; i < 5; i++) assert.equal(await prova(i), 401);
  assert.equal(await prova(99), 429);
  await p.chiudi();
});

test("intestazione IP malformata: nessun 500", async () => {
  const p = await avviaProva();
  const { request } = await import("node:http");
  const stato = await new Promise((ok, ko) => {
    const r = request(`${p.base}/api/admin/login`, { method: "POST", headers: {
      Origin: p.base, "Content-Type": "application/json", "X-Forwarded-For": "1:2:3:4:5:6:7:8:9::1" } }, res => { res.resume(); ok(res.statusCode); });
    r.on("error", ko); r.end(JSON.stringify({ pin: PIN_PROVA }));
  });
  assert.equal(stato, 200);
  await p.chiudi();
});

test("su https (tunnel) il cookie è Secure anche fuori dalla produzione", async () => {
  const p = await avviaProva();
  const { request } = await import("node:http");
  const cookie = await new Promise((ok, ko) => {
    const r = request(`${p.base}/api/admin/login`, { method: "POST", headers: {
      Origin: p.base, "Content-Type": "application/json", "X-Forwarded-Proto": "https" } }, res => { res.resume(); ok(res.headers["set-cookie"][0]); });
    r.on("error", ko); r.end(JSON.stringify({ pin: PIN_PROVA }));
  });
  assert.match(cookie, /^__Host-sessione=.*; Secure;/);
  await p.chiudi();
});
