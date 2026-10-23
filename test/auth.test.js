import { test } from "node:test";
import assert from "node:assert/strict";
import { dbDiProva } from "./aiuto.js";
import {
  creaHash, verificaPin, pinBanale, hashToken, creaSessione, leggiSessione, chiudiSessione,
  chiudiAltreSessioni, creaLimitatore, creaGuardiaLogin, troncaIp, descriviDispositivo, registraAccesso
} from "../server/auth.js";

const ora = s => new Date(s);

test("verificaPin", () => {
  const { hash, sale } = creaHash("482915");
  assert.equal(verificaPin("482915", hash, sale), true);
  assert.equal(verificaPin("482916", hash, sale), false);
});

test("il token non è salvato in chiaro", () => {
  const db = dbDiProva();
  const t = creaSessione(db, { utente: "banco", dispositivo: "x", now: new Date() });
  assert.match(t, /^[0-9a-f]{64}$/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessioni WHERE token_hash = ?").get(t).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessioni WHERE token_hash = ?").get(hashToken(t)).n, 1);
  assert.equal(leggiSessione(db, t, new Date()).utente, "banco");
});

test("token sconosciuto o vuoto", () => {
  const db = dbDiProva();
  assert.equal(leggiSessione(db, "abc", new Date()), null);
  assert.equal(leggiSessione(db, null, new Date()), null);
});

test("sessione scaduta dopo 30 giorni senza uso", () => {
  const db = dbDiProva();
  const t = creaSessione(db, { utente: "banco", dispositivo: "x", now: ora("2026-01-01T00:00:00Z") });
  assert.equal(leggiSessione(db, t, ora("2026-02-01T00:00:00Z")), null);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessioni").get().n, 0);
});

test("sessione si rinnova con l'uso", () => {
  const db = dbDiProva();
  const t = creaSessione(db, { utente: "banco", dispositivo: "x", now: ora("2026-01-01T00:00:00Z") });
  assert.ok(leggiSessione(db, t, ora("2026-01-25T00:00:00Z")));
  assert.ok(leggiSessione(db, t, ora("2026-02-20T00:00:00Z")));
});

test("chiudiSessione e chiudiAltreSessioni", () => {
  const db = dbDiProva(); const n = new Date();
  const a = creaSessione(db, { utente: "banco", dispositivo: "a", now: n });
  const b = creaSessione(db, { utente: "banco", dispositivo: "b", now: n });
  const c = creaSessione(db, { utente: "banco", dispositivo: "c", now: n });
  chiudiAltreSessioni(db, "banco", a);
  assert.ok(leggiSessione(db, a, n));
  assert.equal(leggiSessione(db, b, n), null);
  assert.equal(leggiSessione(db, c, n), null);
  chiudiSessione(db, a);
  assert.equal(leggiSessione(db, a, n), null);
});

test("limitatore a finestra", () => {
  let t = 0;
  const l = creaLimitatore({ now: () => t });
  assert.equal(l.consenti("k", 2, 1000), true);
  assert.equal(l.consenti("k", 2, 1000), true);
  assert.equal(l.consenti("k", 2, 1000), false);
  t = 1001;
  assert.equal(l.consenti("k", 2, 1000), true);
});

test("blocco per IP dopo 5 errori, poi scade", () => {
  let t = 0;
  const g = creaGuardiaLogin({ now: () => t });
  for (let i = 0; i < 5; i++) g.fallito("1.2.3.4");
  assert.equal(g.bloccato("1.2.3.4"), true);
  assert.equal(g.bloccato("5.6.7.8"), false);
  t = 15 * 60_000 + 1;
  assert.equal(g.bloccato("1.2.3.4"), false);
});

test("blocco globale dopo 30 errori, per un'ora", () => {
  let t = 0;
  const g = creaGuardiaLogin({ now: () => t });
  for (let i = 0; i < 30; i++) g.fallito(`10.0.${i}.1`);
  assert.equal(g.bloccato("192.168.1.1"), true);
  t = 59 * 60_000;
  assert.equal(g.bloccato("192.168.1.1"), true);
  t = 2 * 60 * 60_000;
  assert.equal(g.bloccato("192.168.1.1"), false);
});

test("accesso riuscito azzera i tentativi dell'IP", () => {
  const g = creaGuardiaLogin({ now: () => 0 });
  for (let i = 0; i < 4; i++) g.fallito("1.2.3.4");
  g.riuscito("1.2.3.4");
  g.fallito("1.2.3.4");
  assert.equal(g.bloccato("1.2.3.4"), false);
});

test("pinBanale", () => {
  for (const p of ["111111", "123456", "654321", "246810", "12345", "abcdef", "890123"]) assert.equal(pinBanale(p), true, p);
  assert.equal(pinBanale("482915"), false);
});

test("troncaIp", () => {
  assert.equal(troncaIp("203.0.113.77"), "203.0.113.0");
  assert.equal(troncaIp("::ffff:203.0.113.77"), "203.0.113.0");
  assert.equal(troncaIp("2001:db8:abcd:12::1"), "2001:db8:abcd::");
  assert.equal(troncaIp(""), "");
});

test("descriviDispositivo", () => {
  assert.equal(descriviDispositivo("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"), "Android · Chrome");
  assert.equal(descriviDispositivo("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "iPhone · Safari");
  assert.equal(descriviDispositivo("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0"), "Windows · Firefox");
  assert.equal(descriviDispositivo(""), "Dispositivo sconosciuto");
});

test("registraAccesso tronca l'IP e cancella i vecchi", () => {
  const db = dbDiProva();
  registraAccesso(db, { esito: "ko", dispositivo: "x", ip: "203.0.113.9", now: ora("2026-01-01T00:00:00Z") });
  registraAccesso(db, { esito: "ok", dispositivo: "x", ip: "203.0.113.9", now: ora("2026-03-01T00:00:00Z") });
  const righe = db.prepare("SELECT * FROM accessi").all();
  assert.equal(righe.length, 1);
  assert.equal(righe[0].ip_troncato, "203.0.113.0");
  assert.equal(righe[0].esito, "ok");
});

/* ---------- dalla revisione della fase 1 ---------- */

test("blocco globale: le reti già usate dal titolare possono ancora entrare", () => {
  const g = creaGuardiaLogin({ now: () => 0, fidato: ip => ip === "192.168.1.20" });
  for (let i = 0; i < 30; i++) g.fallito(`10.0.${i}.1`);
  assert.equal(g.motivo("192.168.1.20"), null);
  assert.equal(g.motivo("8.8.8.8"), "globale");
  for (let i = 0; i < 5; i++) g.fallito("192.168.1.20");
  assert.equal(g.motivo("192.168.1.20"), "ip");
});

/* ---------- dalla revisione di sicurezza ---------- */

test("troncaIp non esplode con indirizzi malformati", () => {
  assert.doesNotThrow(() => troncaIp("1:2:3:4:5:6:7:8:9::1"));
  assert.equal(troncaIp("non-un-ip"), "");
});

test("una sessione dura al massimo 90 giorni anche se usata ogni giorno", () => {
  const db = dbDiProva();
  const t = creaSessione(db, { utente: "banco", dispositivo: "x", now: ora("2026-01-01T00:00:00Z") });
  for (let g = 1; g < 90; g += 20) assert.ok(leggiSessione(db, t, ora(new Date(Date.UTC(2026, 0, 1 + g)).toISOString())), `giorno ${g}`);
  assert.equal(leggiSessione(db, t, ora("2026-04-02T00:00:00Z")), null);
});
