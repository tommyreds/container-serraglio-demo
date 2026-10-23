import { test } from "node:test";
import assert from "node:assert/strict";
import { dbDiProva, avviaProva } from "./aiuto.js";
import { creaRender, schedaHtml } from "../server/render.js";
import { scriviImpostazione } from "../server/db.js";

const GIOVEDI = () => new Date("2026-10-22T12:00:00+02:00");
const pagina = (db = dbDiProva(), now = GIOVEDI) => creaRender({ db, now }).pagina();
const categoria = { id: "schiacciate", nome: "Schiacciate", prezzo: 6 };
const base = {
  id: "x1", categoria_id: "schiacciate", nome: "Prova", descrizione: "Crudo, rucola", allergeni: ["glutine", "latte"],
  surgelati: false, foto: null, prezzo: null, prezzo_finale: 6, disponibile: true, finito: false
};

test("nomi pericolosi escono come testo", () => {
  const db = dbDiProva();
  db.prepare("UPDATE prodotti SET nome = ? WHERE id = 'hb'").run("<img src=x onerror=alert(1)>");
  const html = pagina(db);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!html.includes("<img src=x"));
});

test("la scheda mostra ingredienti, allergeni e il pulsante con etichetta", () => {
  const html = schedaHtml(base, categoria);
  assert.match(html, /<article class="scheda" data-id="x1">/);
  assert.ok(html.includes("Crudo, rucola"));
  assert.ok(html.includes("Allergeni: Glutine, Latte"));
  assert.ok(html.includes('aria-label="Aggiungi Prova"'));
  assert.ok(!html.includes("surgelati"));
});

test("surgelati segnalati", () =>
  assert.ok(schedaHtml({ ...base, surgelati: true }, categoria).includes("* contiene surgelati")));

test("prodotto finito: disabilitato e segnato", () => {
  const html = schedaHtml({ ...base, finito: true }, categoria);
  assert.match(html, /class="scheda finito"/);
  assert.ok(html.includes("Finito per oggi"));
  assert.match(html, /<button class="piu"[^>]*disabled/);
});

test("senza foto usa l'illustrazione della categoria", () => {
  assert.ok(schedaHtml(base, categoria).includes("#ill-schiacciata"));
  assert.ok(schedaHtml({ ...base, id: "hd", categoria_id: "griglia" }, { ...categoria, id: "griglia" }).includes("#ill-hotdog"));
  assert.ok(schedaHtml({ ...base, categoria_id: "dolci" }, { ...categoria, id: "dolci" }).includes("#ill-piatto"));
});

test("con foto: img con dimensioni e caricamento pigro", () => {
  const html = schedaHtml({ ...base, foto: "img/p-hamburger.webp" }, categoria);
  assert.match(html, /<img src="img\/p-hamburger\.webp" alt="" width="552" height="400" loading="lazy" decoding="async">/);
});

test("prezzo proprio diverso dalla categoria compare sulla scheda", () => {
  assert.ok(!schedaHtml(base, categoria).includes("scheda-prezzo"));
  assert.ok(schedaHtml({ ...base, prezzo: 6.5, prezzo_finale: 6.5 }, categoria).includes("6,50 €"));
});

test("pagina completa: sezioni, categorie e pillole prezzo", () => {
  const html = pagina();
  for (const testo of ["01 · Come funziona", "02 · Il menù", "03 · Dove siamo", "Cosa mangi oggi?",
    "Tre tocchi e passi a prenderlo", "Il pranzo <mark>a due passi</mark> dal PIN", "Vai al menù"]) {
    assert.ok(html.includes(testo), testo);
  }
  assert.ok(html.includes('id="cat-schiacciate"'));
  assert.ok(html.includes('<span class="pillola-prezzo">6 €</span>'));
  assert.ok(html.includes('<a href="#cat-pinsa">Pinse</a>'));
});

test("badge stato dal fuso di Roma", () => {
  assert.ok(pagina(dbDiProva(), GIOVEDI).includes("Aperto · fino alle 15:00"));
  // 22:30 UTC di sabato è già domenica a Roma: lunedì è "domani"
  assert.ok(pagina(dbDiProva(), () => new Date("2026-10-24T22:30:00Z")).includes("Chiuso · riapre domani alle 10:00"));
  assert.ok(pagina(dbDiProva(), () => new Date("2026-10-24T12:00:00+02:00")).includes("Chiuso · riapre lunedì alle 10:00"));
});

test("badge stato aggiornato a ogni richiesta anche con la cache", () => {
  let ora = GIOVEDI();
  const r = creaRender({ db: dbDiProva(), now: () => ora });
  assert.ok(r.pagina().includes("Aperto · fino alle 15:00"));
  ora = new Date("2026-10-22T16:00:00+02:00");
  assert.ok(r.pagina().includes("Chiuso · riapre domani alle 10:00"));
});

test("orari con oggi evidenziato e chiusure dei prossimi 30 giorni", () => {
  const db = dbDiProva();
  db.prepare("INSERT INTO chiusure (data, motivo) VALUES ('2026-11-01', 'Ognissanti'), ('2027-01-01', 'lontana')").run();
  const html = pagina(db);
  assert.match(html, /<li class="oggi"><span>Giovedì<\/span><span>10:00–15:00<\/span><\/li>/);
  assert.ok(html.includes("<span>Sabato</span><span>Chiuso</span>"));
  assert.ok(html.includes("Chiuso domenica 1 novembre · Ognissanti"));
  assert.ok(!html.includes("lontana"));
});

test("badge Google nascosto se manca il voto, visibile se c'è", () => {
  const db = dbDiProva();
  assert.ok(!pagina(db).includes("badge-google"));
  scriviImpostazione(db, "google_voto", "4.7");
  scriviImpostazione(db, "google_recensioni", "120");
  scriviImpostazione(db, "google_aggiornato", "2026-10-20");
  scriviImpostazione(db, "google_link", "https://maps.app.goo.gl/abc");
  const html = pagina(db);
  assert.ok(html.includes("4,7 · 120 recensioni su Google"));
  assert.ok(html.includes("aggiornato il 20/10/2026"));
  assert.ok(html.includes('href="https://maps.app.goo.gl/abc"'));
});

test("modalità demo: noindex e nastro; spenta: niente", () => {
  const db = dbDiProva();
  let html = pagina(db);
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(html.includes("Demo — sito non ufficiale"));
  scriviImpostazione(db, "modalita_demo", "0");
  html = pagina(db);
  assert.ok(!html.includes("noindex"));
  assert.ok(!html.includes("Demo — sito non ufficiale"));
});

test("la cache si svuota dopo invalida", () => {
  const db = dbDiProva();
  const r = creaRender({ db, now: GIOVEDI });
  assert.ok(r.pagina().includes("Container Serraglio 1"));
  db.prepare("UPDATE prodotti SET nome = 'Nuovo nome' WHERE id = 'sc1'").run();
  assert.ok(r.pagina().includes("Container Serraglio 1"));
  r.invalida();
  assert.ok(r.pagina().includes("Nuovo nome"));
});

test("nessuno script o stile inline", () => {
  const html = pagina();
  assert.ok(!/<script(?![^>]*\b(src=|type="application\/(json|ld\+json)"))[^>]*>/.test(html));
  assert.ok(!/\sstyle=|\son[a-z]+=/i.test(html));
});

test("dati per il browser in JSON sicuro", () => {
  const html = pagina();
  const dati = JSON.parse(html.match(/<script type="application\/json" id="dati">(.*?)<\/script>/s)[1]);
  assert.equal(dati.oggi, "2026-10-22");
  assert.equal(dati.orari.length, 7);
  assert.equal(dati.prodotti.sc1.prezzo_finale, 6);
  assert.equal(dati.impostazioni.whatsapp, "393270536624");
});

test("JSON-LD Restaurant", () => {
  const db = dbDiProva();
  let ld = JSON.parse(pagina(db).match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "Restaurant");
  assert.equal(ld.address.postalCode, "59100");
  assert.equal(ld.openingHoursSpecification.length, 5);
  assert.equal(ld.aggregateRating, undefined);
  scriviImpostazione(db, "google_voto", "4.7");
  scriviImpostazione(db, "google_recensioni", "120");
  ld = JSON.parse(pagina(db).match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(ld.aggregateRating, { "@type": "AggregateRating", ratingValue: "4.7", reviewCount: "120", bestRating: "5" });
});

test("risorse versionate per la cache lunga", () =>
  assert.match(pagina(), /href="style\.css\?v=[0-9a-f]{8}"/));

test("GET / risponde con la pagina e non espone il modello", async () => {
  const p = await avviaProva({ now: GIOVEDI });
  const r = await fetch(p.base + "/");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.equal(r.headers.get("cache-control"), "no-cache");
  assert.ok((await r.text()).includes("Cosa mangi oggi?"));
  assert.equal((await fetch(p.base + "/index.html")).status, 404);
  await p.chiudi();
});

test("una modifica dal pannello si vede subito sulla pagina", async () => {
  const p = await avviaProva({ now: GIOVEDI });
  const c = await p.accedi();
  await fetch(p.base + "/");
  await p.richiesta("PATCH", "/api/admin/prodotti/sc1", { cookie: c, corpo: { nome: "Appena cambiato" } });
  assert.ok((await (await fetch(p.base + "/")).text()).includes("Appena cambiato"));
  await p.chiudi();
});

test("la pagina viaggia compressa se il browser lo accetta", async () => {
  const p = await avviaProva({ now: GIOVEDI });
  const { request } = await import("node:http");
  const intestazioni = await new Promise((ok, ko) => {
    request(p.base + "/", { headers: { "Accept-Encoding": "gzip" } }, r => { r.resume(); ok(r.headers); }).on("error", ko).end();
  });
  assert.equal(intestazioni["content-encoding"], "gzip");
  assert.match(intestazioni.vary, /Accept-Encoding/);
  await p.chiudi();
});
