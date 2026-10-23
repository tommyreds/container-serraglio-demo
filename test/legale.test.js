import { test } from "node:test";
import assert from "node:assert/strict";
import { dbDiProva, avviaProva } from "./aiuto.js";
import { paginaLegale, footerLegale, robotsTxt, sitemapXml } from "../server/legale.js";
import { leggiImpostazioni, leggiMenu, scriviImpostazione } from "../server/db.js";

const OGGI = "2026-10-22";
const contesto = db => ({ impostazioni: leggiImpostazioni(db), menu: leggiMenu(db, { oggi: OGGI }), oggi: OGGI });
const senzaInline = html => !/<script(?![^>]*\b(src=|type="application\/(json|ld\+json)"))[^>]*>/.test(html) && !/\sstyle=|\son[a-z]+=/i.test(html);

test("piede: dati mancanti segnalati, dati presenti mostrati", () => {
  const db = dbDiProva();
  assert.ok(footerLegale(leggiImpostazioni(db)).includes('P.IVA <span class="da-completare">dato da completare</span>'));
  scriviImpostazione(db, "piva", "01234567890");
  scriviImpostazione(db, "ragione_sociale", "Bar & Co <srl>");
  const html = footerLegale(leggiImpostazioni(db));
  assert.ok(html.includes("P.IVA 01234567890"));
  assert.ok(html.includes("Bar &amp; Co &lt;srl&gt;"));
});

test("privacy: titolare, WhatsApp, nessun cookie di terzi", () => {
  const db = dbDiProva();
  scriviImpostazione(db, "titolare_trattamento", "Almanacco <APS>");
  const html = paginaLegale("privacy", contesto(db));
  assert.ok(html.includes("Almanacco &lt;APS&gt;"));
  for (const testo of ["WhatsApp", "Meta", "localStorage", "7 giorni", "Garante", "nessun servizio di terzi"]) {
    assert.ok(html.includes(testo), testo);
  }
  assert.ok(senzaInline(html));
});

test("privacy senza titolare: dato da completare", () =>
  assert.ok(paginaLegale("privacy", contesto(dbDiProva())).includes("dato da completare")));

test("allergeni: tabella con le spunte giuste e nota sulle tracce", () => {
  const html = paginaLegale("allergeni", contesto(dbDiProva()));
  const riga = html.match(/<tr><th scope="row">Hamburgher<\/th>(.*?)<\/tr>/s)[1];
  const celle = [...riga.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(m => m[1]);
  assert.equal(celle.length, 14);
  assert.match(celle[0], /✓/);    // glutine
  assert.match(celle[10], /✓/);   // sesamo
  assert.equal(celle[1].includes("✓"), false);
  assert.ok(html.includes("tracce"));
  assert.ok(senzaInline(html));
});

test("allergeni non verificati: avviso sulla pagina", () => {
  const db = dbDiProva();
  assert.ok(paginaLegale("allergeni", contesto(db)).includes("in corso di verifica"));
  scriviImpostazione(db, "allergeni_verificati", "1");
  assert.ok(!paginaLegale("allergeni", contesto(db)).includes("in corso di verifica"));
});

test("come funzionano gli ordini: accettazione, pagamento, recesso", () => {
  const html = paginaLegale("ordini-come", contesto(dbDiProva()));
  for (const testo of ["risponde", "al ritiro", "IVA inclusa", "art. 59", "deperibili"]) assert.ok(html.includes(testo), testo);
});

test("crediti: solo le foto ancora usate", () => {
  const db = dbDiProva();
  let html = paginaLegale("crediti", contesto(db));
  assert.ok(html.includes("RodzillaReviews"));
  db.prepare("UPDATE prodotti SET foto = 'foto/0123456789abcdef.webp' WHERE id = 'sc1'").run();
  html = paginaLegale("crediti", contesto(db));
  assert.ok(!html.includes("RodzillaReviews"));
  assert.ok(html.includes("François Nguyen"));
});

test("robots e sitemap", () => {
  assert.equal(robotsTxt(true), "User-agent: *\nDisallow: /\n");
  assert.equal(robotsTxt(false, "https://esempio.it"), "User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: https://esempio.it/sitemap.xml\n");
  const xml = sitemapXml("https://esempio.it");
  for (const u of ["https://esempio.it/", "https://esempio.it/privacy", "https://esempio.it/allergeni", "https://esempio.it/ordini-come"]) {
    assert.ok(xml.includes(`<loc>${u}</loc>`), u);
  }
});

test("le pagine rispondono, in demo noindex, e il piede è uguale alla home", async () => {
  const p = await avviaProva();
  for (const percorso of ["/privacy", "/allergeni", "/ordini-come", "/crediti"]) {
    const r = await fetch(p.base + percorso);
    assert.equal(r.status, 200, percorso);
    const html = await r.text();
    assert.ok(html.includes('<meta name="robots" content="noindex">'), percorso);
    assert.ok(html.includes("dato da completare"), percorso);
  }
  assert.equal(await (await fetch(p.base + "/robots.txt")).text(), "User-agent: *\nDisallow: /\n");
  assert.equal((await fetch(p.base + "/sitemap.xml")).headers.get("content-type").split(";")[0], "application/xml");
  await p.chiudi();
});
