import { test } from "node:test";
import assert from "node:assert/strict";
import { euro, pulisci, componiMessaggio, linkWhatsApp } from "../public/lib/whatsapp.js";

const NBSP = String.fromCharCode(160);
const BEL = String.fromCharCode(7);

test("euro in formato italiano", () => {
  assert.equal(euro(12), `12,00${NBSP}€`);
  assert.equal(euro(6.5), `6,50${NBSP}€`);
});

test("messaggio completo", () => {
  const m = componiMessaggio({
    nome: "Giulia", ora: "13:10", note: "senza maionese", demo: false,
    righe: [{ nome: "Container Serraglio 1", quantita: 2, prezzo: 6 }, { nome: "Hamburgher", quantita: 1, prezzo: 8 }]
  });
  assert.equal(m, [
    "Ciao! Ordine per il ritiro alle 13:10",
    "Nome: Giulia",
    `• 2× Container Serraglio 1 — 12,00${NBSP}€`,
    `• 1× Hamburgher — 8,00${NBSP}€`,
    `Totale: 20,00${NBSP}€ (pago al ritiro)`,
    "Note: senza maionese"
  ].join("\n"));
});

test("demo e note vuote", () => {
  const m = componiMessaggio({ nome: "Luca", ora: "12:00", note: "", demo: true, righe: [{ nome: "Hot dog", quantita: 1, prezzo: 8 }] });
  assert.ok(m.startsWith("[DEMO] Ciao!"));
  assert.ok(!m.includes("Note:"));
});

test("pulisci toglie formattazione e a capo", () =>
  assert.equal(pulisci(`  *ciao*\n_mondo_ ~x~ \`y\`${BEL} `, 40), "ciao mondo x y"));

test("pulisci tronca senza spezzare le emoji", () =>
  assert.equal(pulisci("🍕🍕🍕", 2), "🍕🍕"));

test("nome e note lunghi vengono tagliati", () => {
  const m = componiMessaggio({ nome: "a".repeat(80), ora: "12:00", note: "b".repeat(400), demo: false, righe: [{ nome: "X", quantita: 1, prezzo: 1 }] });
  assert.ok(m.includes(`Nome: ${"a".repeat(40)}\n`));
  assert.ok(m.endsWith(`Note: ${"b".repeat(200)}`));
});

test("accenti, emoji e simboli arrivano intatti", () => {
  const url = linkWhatsApp("39 327-053", componiMessaggio({
    nome: "Niccolò", ora: "12:00", note: "Caffè & <b>emoji 🍕</b>", demo: false,
    righe: [{ nome: "Più", quantita: 1, prezzo: 6.5 }]
  }));
  assert.ok(url.startsWith("https://wa.me/39327053?text="));
  const testo = decodeURIComponent(url.split("text=")[1]);
  assert.ok(testo.includes("Caffè & <b>emoji 🍕</b>"));
  assert.ok(testo.includes("Nome: Niccolò"));
});

test("anche i nomi dei prodotti non attivano la formattazione di WhatsApp", () => {
  const m = componiMessaggio({ nome: "Ada", ora: "12:00", note: "", demo: false, righe: [{ nome: "Panino *speciale* _vero_", quantita: 1, prezzo: 6 }] });
  assert.ok(m.includes("1× Panino speciale vero —"));
});
