import { test } from "node:test";
import assert from "node:assert/strict";
import { avviaProva, dbDiProva } from "./aiuto.js";

const GIOVEDI = () => new Date("2026-10-22T12:00:00+02:00");
const VENERDI = () => new Date("2026-10-23T12:00:00+02:00");
const prodotto = (menu, id) => menu.categorie.flatMap(c => c.prodotti).find(p => p.id === id);

async function conAccesso(opzioni = {}) {
  const p = await avviaProva({ now: GIOVEDI, ...opzioni });
  const cookie = await p.accedi();
  const chiama = (metodo, percorso, corpo) => p.richiesta(metodo, `/api/admin${percorso}`, { cookie, corpo });
  return { ...p, cookie, chiama };
}

test("menù del pannello con nascosti, impostazioni e allergeni", async () => {
  const p = await conAccesso();
  await p.chiama("PATCH", "/prodotti/hd", { disponibile: false });
  const r = (await p.chiama("GET", "/menu")).json;
  assert.equal(r.oggi, "2026-10-22");
  assert.equal(prodotto(r, "hd").disponibile, false);
  assert.equal(r.allergeni.length, 14);
  assert.equal(r.impostazioni.modalita_demo, "1");
  await p.chiudi();
});

test("segna finito e torna disponibile il giorno dopo", async () => {
  const db = dbDiProva();
  const p = await conAccesso({ db });
  assert.equal((await p.chiama("PUT", "/prodotti/hb/finito", { finito: true })).stato, 200);
  assert.equal(prodotto((await p.richiesta("GET", "/api/menu")).json, "hb").finito, true);
  await p.chiudi();
  const domani = await avviaProva({ db, now: VENERDI });
  assert.equal(prodotto((await domani.richiesta("GET", "/api/menu")).json, "hb").finito, false);
  await domani.chiudi();
});

test("modifica prodotto", async () => {
  const p = await conAccesso();
  const r = await p.chiama("PATCH", "/prodotti/sc1", {
    nome: "Container 1", descrizione: "Crudo, rucola", allergeni: ["latte", "glutine"], surgelati: true, prezzo: "6,50"
  });
  assert.equal(r.stato, 200);
  const sc1 = prodotto((await p.chiama("GET", "/menu")).json, "sc1");
  assert.equal(sc1.nome, "Container 1");
  assert.deepEqual(sc1.allergeni, ["glutine", "latte"]);
  assert.equal(sc1.surgelati, true);
  assert.equal(sc1.prezzo_finale, 6.5);
  await p.chiama("PATCH", "/prodotti/sc1", { prezzo: "" });
  assert.equal(prodotto((await p.chiama("GET", "/menu")).json, "sc1").prezzo, null);
  await p.chiudi();
});

test("allergeni sconosciuti: 400", async () => {
  const p = await conAccesso();
  const r = await p.chiama("PATCH", "/prodotti/sc1", { allergeni: ["noci"] });
  assert.equal(r.stato, 400);
  assert.equal(r.json.errore, "Allergene non riconosciuto.");
  await p.chiudi();
});

test("prezzo sbagliato: messaggio chiaro", async () => {
  const p = await conAccesso();
  const r = await p.chiama("PATCH", "/prodotti/sc1", { prezzo: "abc" });
  assert.equal(r.stato, 400);
  assert.equal(r.json.errore, "Il prezzo deve essere un numero, es. 6 o 6,50.");
  await p.chiudi();
});

test("prodotto inesistente: 404", async () => {
  const p = await conAccesso();
  assert.equal((await p.chiama("PATCH", "/prodotti/boh", { nome: "Xx" })).stato, 404);
  await p.chiudi();
});

test("aggiungi ed elimina prodotto", async () => {
  const p = await conAccesso();
  const r = await p.chiama("POST", "/prodotti", { categoria_id: "pinsa", nome: "Diavola", descrizione: "Pomodoro, salame", allergeni: ["glutine"] });
  assert.equal(r.stato, 201);
  const menu = (await p.chiama("GET", "/menu")).json;
  const nuovo = prodotto(menu, r.json.id);
  assert.equal(nuovo.nome, "Diavola");
  assert.equal(menu.categorie.find(c => c.id === "pinsa").prodotti.at(-1).id, r.json.id);
  assert.equal((await p.chiama("DELETE", `/prodotti/${r.json.id}`)).stato, 200);
  assert.equal(prodotto((await p.chiama("GET", "/menu")).json, r.json.id), undefined);
  await p.chiudi();
});

test("aggiungi prodotto in categoria inesistente: 400", async () => {
  const p = await conAccesso();
  assert.equal((await p.chiama("POST", "/prodotti", { categoria_id: "boh", nome: "Xx" })).stato, 400);
  await p.chiudi();
});

test("sposta su scambia la posizione, ai bordi non fa niente", async () => {
  const p = await conAccesso();
  const ordine = async () => (await p.chiama("GET", "/menu")).json.categorie[0].prodotti.map(x => x.id).slice(0, 3);
  assert.deepEqual(await ordine(), ["sc1", "sc2", "al1"]);
  await p.chiama("POST", "/prodotti/sc2/sposta", { direzione: "su" });
  assert.deepEqual(await ordine(), ["sc2", "sc1", "al1"]);
  assert.equal((await p.chiama("POST", "/prodotti/sc2/sposta", { direzione: "su" })).stato, 200);
  assert.deepEqual(await ordine(), ["sc2", "sc1", "al1"]);
  await p.chiama("POST", "/prodotti/sc2/sposta", { direzione: "giu" });
  assert.deepEqual(await ordine(), ["sc1", "sc2", "al1"]);
  assert.equal((await p.chiama("POST", "/prodotti/sc2/sposta", { direzione: "di lato" })).stato, 400);
  await p.chiudi();
});

test("categorie: modifica, aggiungi, elimina solo se vuota", async () => {
  const p = await conAccesso();
  assert.equal((await p.chiama("PATCH", "/categorie/pinsa", { prezzo: "7,50", nota: "Novità" })).stato, 200);
  const pinsa = (await p.chiama("GET", "/menu")).json.categorie.find(c => c.id === "pinsa");
  assert.equal(pinsa.prezzo, 7.5);
  assert.equal(pinsa.prodotti[0].prezzo_finale, 7.5);
  const piena = await p.chiama("DELETE", "/categorie/pinsa");
  assert.equal(piena.stato, 409);
  assert.equal(piena.json.errore, "Svuota la categoria prima di eliminarla.");
  const nuova = await p.chiama("POST", "/categorie", { nome: "Dolci", prezzo: "3" });
  assert.equal(nuova.stato, 201);
  assert.equal((await p.chiama("DELETE", `/categorie/${nuova.json.id}`)).stato, 200);
  await p.chiudi();
});

test("orari: salvataggio e validazione", async () => {
  const p = await conAccesso();
  const settimana = [0, 1, 2, 3, 4, 5, 6].map(g => g < 5 ? { apertura: "09:30", chiusura: "15:30" } : { apertura: null, chiusura: null });
  assert.equal((await p.chiama("PUT", "/orari", { orari: settimana })).stato, 200);
  assert.equal((await p.richiesta("GET", "/api/menu")).json.orari[0].apertura, "09:30");
  const sbagliati = settimana.map((o, i) => i === 0 ? { apertura: "16:00", chiusura: "15:00" } : o);
  const r = await p.chiama("PUT", "/orari", { orari: sbagliati });
  assert.equal(r.stato, 400);
  assert.equal(r.json.errore, "Lunedì: l'apertura deve venire prima della chiusura.");
  assert.equal((await p.chiama("PUT", "/orari", { orari: settimana.slice(0, 6) })).stato, 400);
  await p.chiudi();
});

test("chiusura di oggi compare in /api/menu e si toglie", async () => {
  const p = await conAccesso();
  assert.equal((await p.chiama("POST", "/chiusure", { data: "2026-10-22", motivo: "Imprevisto" })).stato, 200);
  assert.deepEqual((await p.richiesta("GET", "/api/menu")).json.chiusure, [{ data: "2026-10-22", motivo: "Imprevisto" }]);
  assert.equal((await p.chiama("DELETE", "/chiusure/2026-10-22")).stato, 200);
  assert.deepEqual((await p.richiesta("GET", "/api/menu")).json.chiusure, []);
  assert.equal((await p.chiama("POST", "/chiusure", { data: "2026-02-30" })).stato, 400);
  await p.chiudi();
});

test("impostazioni: voto Google aggiorna la data, chiavi ignote ignorate", async () => {
  const p = await conAccesso();
  const r = await p.chiama("PATCH", "/impostazioni", { google_voto: "4,7", google_recensioni: "120", pin: "1", hash: "x" });
  assert.equal(r.stato, 200);
  const imp = (await p.chiama("GET", "/menu")).json.impostazioni;
  assert.equal(imp.google_voto, "4.7");
  assert.equal(imp.google_aggiornato, "2026-10-22");
  assert.equal(imp.pin, undefined);
  await p.chiudi();
});

test("impostazioni: un valore sbagliato non salva niente", async () => {
  const p = await conAccesso();
  const r = await p.chiama("PATCH", "/impostazioni", { telefono: "055 123", whatsapp: "ciao" });
  assert.equal(r.stato, 400);
  assert.equal((await p.chiama("GET", "/menu")).json.impostazioni.telefono, "327 053 6624");
  assert.equal((await p.chiama("PATCH", "/impostazioni", { boh: "1" })).stato, 400);
  await p.chiudi();
});

test("primo del giorno: aggiorna e torna disponibile", async () => {
  const p = await conAccesso();
  await p.chiama("PUT", "/prodotti/pr1/finito", { finito: true });
  assert.equal((await p.chiama("PUT", "/primo", { descrizione: "Pasta al ragù" })).stato, 200);
  const pr1 = prodotto((await p.richiesta("GET", "/api/menu")).json, "pr1");
  assert.equal(pr1.descrizione, "Pasta al ragù");
  assert.equal(pr1.finito, false);
  await p.chiudi();
});

test("ogni scrittura svuota la cache della pagina", async () => {
  const p = await conAccesso();
  let volte = 0;
  p.app.locals.invalida = () => { volte++; };
  await p.chiama("PUT", "/prodotti/hb/finito", { finito: true });
  await p.chiama("PATCH", "/impostazioni", { ordini_attivi: "0" });
  assert.equal(volte, 2);
  await p.chiudi();
});

test("ogni rotta del pannello senza sessione: 401", async () => {
  const p = await avviaProva();
  const rotte = [
    ["GET", "/menu"], ["POST", "/prodotti"], ["PATCH", "/prodotti/sc1"], ["DELETE", "/prodotti/sc1"],
    ["POST", "/prodotti/sc1/sposta"], ["PUT", "/prodotti/sc1/finito"], ["POST", "/categorie"],
    ["PATCH", "/categorie/pinsa"], ["DELETE", "/categorie/pinsa"], ["PUT", "/orari"], ["POST", "/chiusure"],
    ["DELETE", "/chiusure/2026-10-22"], ["PATCH", "/impostazioni"], ["PUT", "/primo"], ["GET", "/accessi"],
    ["POST", "/pin"], ["POST", "/logout"], ["POST", "/logout-tutti"], ["GET", "/stato"]
  ];
  for (const [metodo, percorso] of rotte) {
    assert.equal((await p.richiesta(metodo, `/api/admin${percorso}`, { corpo: {} })).stato, 401, `${metodo} ${percorso}`);
  }
  await p.chiudi();
});

/* ---------- dalla revisione della fase 1 ---------- */

test("DELETE senza corpo, come lo manda il browser", async () => {
  const p = await conAccesso();
  const r = await p.richiesta("DELETE", "/api/admin/chiusure/2026-10-22", { cookie: p.cookie, senzaCorpo: true });
  assert.equal(r.stato, 200);
  const nuova = await p.chiama("POST", "/categorie", { nome: "Dolci", prezzo: "3" });
  assert.equal((await p.richiesta("DELETE", `/api/admin/categorie/${nuova.json.id}`, { cookie: p.cookie, senzaCorpo: true })).stato, 200);
  await p.chiudi();
});

test("interruttori accettano solo vero o falso", async () => {
  const p = await conAccesso();
  assert.equal((await p.chiama("PATCH", "/prodotti/sc1", { surgelati: "forse" })).stato, 400);
  await p.chiama("PATCH", "/prodotti/sc1", { surgelati: true });
  await p.chiama("PATCH", "/prodotti/sc1", { surgelati: "0" });
  assert.equal(prodotto((await p.chiama("GET", "/menu")).json, "sc1").surgelati, false);
  assert.equal((await p.chiama("PUT", "/prodotti/hb/finito", { finito: "false" })).stato, 200);
  assert.equal(prodotto((await p.chiama("GET", "/menu")).json, "hb").finito, false);
  assert.equal((await p.chiama("PATCH", "/prodotti/sc1", { disponibile: "boh" })).stato, 400);
  await p.chiudi();
});
