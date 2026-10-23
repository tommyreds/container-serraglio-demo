import { test } from "node:test";
import assert from "node:assert/strict";
import { oraRoma, aggiungiGiorni, statoApertura, orariRitiro, testoStato } from "../public/lib/orari.js";

// lunedì-venerdì 10-15, sabato e domenica chiuso
const orari = [0, 1, 2, 3, 4].map(giorno => ({ giorno, apertura: "10:00", chiusura: "15:00" }))
  .concat([5, 6].map(giorno => ({ giorno, apertura: null, chiusura: null })));
const roma = s => new Date(s);

test("oraRoma usa il fuso di Roma anche con server in UTC", () =>
  assert.deepEqual(oraRoma(new Date("2026-10-24T22:30:00Z")), { data: "2026-10-25", minuti: 30, giorno: 6 }));

test("oraRoma nel giorno del cambio d'ora", () =>
  assert.equal(oraRoma(new Date("2026-10-25T11:00:00Z")).minuti, 12 * 60));

test("oraRoma in estate", () =>
  assert.deepEqual(oraRoma(new Date("2026-07-01T10:15:00Z")), { data: "2026-07-01", minuti: 12 * 60 + 15, giorno: 2 }));

test("aggiungiGiorni attraversa mese e anno", () => {
  assert.equal(aggiungiGiorni("2026-10-31", 1), "2026-11-01");
  assert.equal(aggiungiGiorni("2026-12-31", 1), "2027-01-01");
  assert.equal(aggiungiGiorni("2026-03-01", -1), "2026-02-28");
});

test("aperto a metà mattina", () => {
  const s = statoApertura({ orari, chiusure: [], now: roma("2026-10-23T12:00:00+02:00") });
  assert.equal(s.aperto, true);
  assert.equal(s.chiudeAlle, "15:00");
  assert.equal(testoStato(s), "Aperto · fino alle 15:00");
});

test("all'orario di chiusura è chiuso", () =>
  assert.equal(statoApertura({ orari, chiusure: [], now: roma("2026-10-22T15:00:00+02:00") }).aperto, false));

test("venerdì sera riapre lunedì", () => {
  const s = statoApertura({ orari, chiusure: [], now: roma("2026-10-23T18:00:00+02:00") });
  assert.equal(s.aperto, false);
  assert.equal(s.riapre.etichetta, "lunedì alle 10:00");
  assert.equal(s.riapre.data, "2026-10-26");
  assert.equal(testoStato(s), "Chiuso · riapre lunedì alle 10:00");
});

test("giovedì sera riapre domani", () =>
  assert.equal(statoApertura({ orari, chiusure: [], now: roma("2026-10-22T18:00:00+02:00") }).riapre.etichetta, "domani alle 10:00"));

test("prima dell'apertura riapre oggi", () =>
  assert.equal(statoApertura({ orari, chiusure: [], now: roma("2026-10-22T08:00:00+02:00") }).riapre.etichetta, "oggi alle 10:00"));

test("chiusura straordinaria", () => {
  const s = statoApertura({ orari, chiusure: ["2026-10-22"], now: roma("2026-10-22T12:00:00+02:00") });
  assert.equal(s.aperto, false);
  assert.equal(s.chiusoOggi, true);
  assert.equal(testoStato(s), "Chiuso oggi · riapre domani alle 10:00");
});

test("la chiusura straordinaria salta anche il giorno di riapertura", () =>
  assert.equal(statoApertura({ orari, chiusure: ["2026-10-26"], now: roma("2026-10-23T18:00:00+02:00") }).riapre.etichetta, "martedì alle 10:00"));

test("sempre chiuso: nessuna riapertura", () => {
  const chiuso = orari.map(o => ({ ...o, apertura: null, chiusura: null }));
  const s = statoApertura({ orari: chiuso, chiusure: [], now: roma("2026-10-22T12:00:00+02:00") });
  assert.equal(s.riapre, null);
  assert.equal(testoStato(s), "Chiuso");
});

test("orariRitiro arrotonda e rispetta l'anticipo", () =>
  assert.deepEqual(orariRitiro({ orari, chiusure: [], now: roma("2026-10-22T14:22:00+02:00") }), ["14:40", "14:50"]));

test("orariRitiro prima dell'apertura parte dall'apertura", () => {
  const f = orariRitiro({ orari, chiusure: [], now: roma("2026-10-22T07:00:00+02:00") });
  assert.equal(f[0], "10:00");
  assert.equal(f.at(-1), "14:50");
  assert.equal(f.length, 30);
});

test("orariRitiro con passo e anticipo personalizzati", () =>
  assert.deepEqual(orariRitiro({ orari, chiusure: [], now: roma("2026-10-22T14:00:00+02:00"), anticipo: 30, passo: 15 }), ["14:30", "14:45"]));

test("orariRitiro vuoto a ridosso della chiusura", () =>
  assert.deepEqual(orariRitiro({ orari, chiusure: [], now: roma("2026-10-22T14:51:00+02:00") }), []));

test("orariRitiro vuoto nel weekend", () =>
  assert.deepEqual(orariRitiro({ orari, chiusure: [], now: roma("2026-10-24T12:00:00+02:00") }), []));

test("orariRitiro vuoto nei giorni di chiusura", () =>
  assert.deepEqual(orariRitiro({ orari, chiusure: ["2026-10-22"], now: roma("2026-10-22T09:00:00+02:00") }), []));
