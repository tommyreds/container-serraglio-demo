import { test } from "node:test";
import assert from "node:assert/strict";
import { dbDiProva } from "./aiuto.js";
import { leggiMenu, leggiOrari, leggiChiusure, leggiImpostazioni, impostazione, scriviImpostazione } from "../server/db.js";

const tutti = (db, opzioni) => leggiMenu(db, opzioni).flatMap(c => c.prodotti);

test("finito solo nel giorno impostato", () => {
  const db = dbDiProva();
  db.prepare("UPDATE prodotti SET finito_il = ? WHERE id = 'hb'").run("2026-10-22");
  const trova = oggi => tutti(db, { oggi }).find(p => p.id === "hb");
  assert.equal(trova("2026-10-22").finito, true);
  assert.equal(trova("2026-10-23").finito, false);
});

test("prezzo_finale usa la categoria se il prodotto non ha prezzo", () => {
  const p = leggiMenu(dbDiProva(), { oggi: "2026-10-22" })[0].prodotti[0];
  assert.equal(p.prezzo, null);
  assert.equal(p.prezzo_finale, 6);
});

test("prezzo proprio del prodotto vince su quello della categoria", () => {
  const db = dbDiProva();
  db.prepare("UPDATE prodotti SET prezzo = 6.5 WHERE id = 'sc1'").run();
  assert.equal(tutti(db, { oggi: "2026-10-22" }).find(p => p.id === "sc1").prezzo_finale, 6.5);
});

test("i nascosti non compaiono nel menù pubblico", () => {
  const db = dbDiProva();
  db.prepare("UPDATE prodotti SET disponibile = 0 WHERE id = 'hd'").run();
  assert.ok(!tutti(db, { oggi: "2026-10-22" }).some(p => p.id === "hd"));
  const nascosto = tutti(db, { oggi: "2026-10-22", ancheNascosti: true }).find(p => p.id === "hd");
  assert.equal(nascosto.disponibile, false);
});

test("allergeni come codici e surgelati come booleano", () => {
  const p = leggiMenu(dbDiProva(), { oggi: "2026-10-22" })[0].prodotti[0];
  assert.deepEqual(p.allergeni, ["glutine", "latte"]);
  assert.equal(p.surgelati, false);
});

test("categorie e prodotti in ordine di posizione", () => {
  const menu = leggiMenu(dbDiProva(), { oggi: "2026-10-22" });
  assert.deepEqual(menu.map(c => c.id), ["schiacciate", "pinsa", "griglia", "primi"]);
  assert.equal(menu[0].prodotti[0].id, "sc1");
});

test("nessuna tabella di ordini o scorte", () =>
  assert.equal(dbDiProva().prepare(
    "SELECT name FROM sqlite_master WHERE name IN ('ordini','righe_ordine','scorte')").all().length, 0));

test("orari della settimana", () => {
  const o = leggiOrari(dbDiProva());
  assert.equal(o.length, 7);
  assert.deepEqual(o[0], { giorno: 0, apertura: "10:00", chiusura: "15:00" });
  assert.equal(o[6].apertura, null);
});

test("chiusure future in ordine", () => {
  const db = dbDiProva();
  const ins = db.prepare("INSERT INTO chiusure (data, motivo) VALUES (?, ?)");
  ins.run("2026-11-01", "Ognissanti"); ins.run("2026-10-01", "passata"); ins.run("2026-10-30", "");
  assert.deepEqual(leggiChiusure(db, "2026-10-22").map(c => c.data), ["2026-10-30", "2026-11-01"]);
});

test("impostazioni: lettura, scrittura e chiavi nuove", () => {
  const db = dbDiProva();
  assert.equal(impostazione(db, "modalita_demo"), "1");
  assert.equal(impostazione(db, "inesistente", "x"), "x");
  scriviImpostazione(db, "google_voto", "4.7");
  assert.equal(leggiImpostazioni(db).google_voto, "4.7");
  assert.equal(leggiImpostazioni(db).capienza_fascia, undefined);
  assert.equal(leggiImpostazioni(db).piva, "");
});

test("utente del banco creato con il PIN di prova", () =>
  assert.ok(dbDiProva().prepare("SELECT 1 FROM utenti WHERE nome = 'banco'").get()));

test("reimpostaPin sostituisce il PIN e chiude tutte le sessioni", async () => {
  const { reimpostaPin } = await import("../server/seed.js");
  const { verificaPin } = await import("../server/auth.js");
  const db = dbDiProva();
  db.prepare("INSERT INTO sessioni (token_hash, utente, creato_il, ultimo_uso, scade_il) VALUES ('x', 'banco', '', '', '2099-01-01')").run();
  reimpostaPin(db, "730194");
  const u = db.prepare("SELECT hash, sale FROM utenti WHERE nome = 'banco'").get();
  assert.equal(verificaPin("730194", u.hash, u.sale), true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessioni").get().n, 0);
});

test("senza PIN indicato il seed ne sceglie uno casuale non banale", async () => {
  const { semina } = await import("../server/seed.js");
  const { pinBanale, verificaPin } = await import("../server/auth.js");
  const { apriDb } = await import("../server/db.js");
  const db = apriDb(":memory:");
  const { pin } = semina(db, {});
  assert.match(pin, /^\d{6}$/);
  assert.equal(pinBanale(pin), false);
  const u = db.prepare("SELECT hash, sale FROM utenti").get();
  assert.ok(verificaPin(pin, u.hash, u.sale));
  assert.throws(() => semina(apriDb(":memory:"), { pin: "123456" }), /PIN/);
});
