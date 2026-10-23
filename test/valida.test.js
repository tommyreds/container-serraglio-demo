import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ErroreValidazione, leggiPrezzo, leggiTesto, leggiData, leggiOra, normalizzaWhatsapp, leggiLink, VALIDATORI_IMPOSTAZIONI
} from "../server/valida.js";

test("leggiPrezzo accetta virgola e simbolo", () => {
  assert.equal(leggiPrezzo("6,50"), 6.5);
  assert.equal(leggiPrezzo("6.5"), 6.5);
  assert.equal(leggiPrezzo(" 7 € "), 7);
  assert.equal(leggiPrezzo(8), 8);
  assert.equal(leggiPrezzo("6,555"), 6.56);
  for (const v of ["abc", "-1", "1000", "", null, "6,5,0"]) {
    assert.throws(() => leggiPrezzo(v), e => e instanceof ErroreValidazione && /Il prezzo deve essere un numero/.test(e.message), String(v));
  }
});

test("leggiTesto", () => {
  assert.equal(leggiTesto("  ciao  ", { min: 2, max: 10, campo: "Nome" }), "ciao");
  assert.throws(() => leggiTesto("a", { min: 2, max: 10, campo: "Nome" }), /Nome: da 2 a 10 caratteri\./);
  assert.throws(() => leggiTesto("x".repeat(11), { max: 10, campo: "Nome" }), /Nome: da 0 a 10 caratteri\./);
  assert.throws(() => leggiTesto({}, { max: 10, campo: "Nome" }));
});

test("leggiData e leggiOra", () => {
  assert.equal(leggiData("2026-11-01"), "2026-11-01");
  for (const v of ["2026-02-30", "2026-13-01", "1/11/2026", ""]) assert.throws(() => leggiData(v), String(v));
  assert.equal(leggiOra("09:05"), "09:05");
  for (const v of ["24:00", "9:05", "12:60"]) assert.throws(() => leggiOra(v), String(v));
});

test("normalizzaWhatsapp", () => {
  assert.equal(normalizzaWhatsapp("+39 327 053 6624"), "393270536624");
  assert.equal(normalizzaWhatsapp("(39) 327-053-6624"), "393270536624");
  assert.throws(() => normalizzaWhatsapp("ciao"), /Numero WhatsApp non valido/);
  assert.throws(() => normalizzaWhatsapp("1234"));
});

test("leggiLink rifiuta domini e schemi estranei", () => {
  assert.equal(leggiLink("https://www.instagram.com/containerserraglio/"), "https://www.instagram.com/containerserraglio/");
  assert.equal(leggiLink("https://maps.app.goo.gl/abc"), "https://maps.app.goo.gl/abc");
  assert.equal(leggiLink(""), "");
  for (const v of ["http://instagram.com/x", "https://evil.com", "javascript:alert(1)", "https://instagram.com.evil.com", "https://user@evil.com"]) {
    assert.throws(() => leggiLink(v), String(v));
  }
});

test("validatori delle impostazioni", () => {
  const V = VALIDATORI_IMPOSTAZIONI;
  assert.equal(V.google_voto("4,7"), "4.7");
  assert.throws(() => V.google_voto("6"));
  assert.equal(V.google_recensioni("120"), "120");
  assert.throws(() => V.google_recensioni("molte"));
  assert.equal(V.passo_fascia("15"), "15");
  assert.throws(() => V.passo_fascia("7"));
  assert.equal(V.anticipo_minimo("20"), "20");
  assert.throws(() => V.anticipo_minimo("500"));
  assert.equal(V.piva(""), "");
  assert.equal(V.piva("01234567890"), "01234567890");
  assert.throws(() => V.piva("123"));
  assert.equal(V.ordini_attivi("0"), "0");
  assert.throws(() => V.ordini_attivi("forse"));
  assert.equal(V.whatsapp("+39 327 053 6624"), "393270536624");
  assert.equal(V.pec(""), "");
  assert.throws(() => V.pec("non-una-mail"));
  assert.equal(V.google_voto(""), "");
});

test("normalizzaWhatsapp aggiusta i numeri italiani e rifiuta quelli inutilizzabili", () => {
  assert.equal(normalizzaWhatsapp("327 053 6624"), "393270536624");
  assert.equal(normalizzaWhatsapp("0039 327 053 6624"), "393270536624");
  assert.equal(normalizzaWhatsapp("+44 7700 900123"), "447700900123");
  assert.throws(() => normalizzaWhatsapp("0574 123456"), /Numero WhatsApp non valido/);
  assert.throws(() => normalizzaWhatsapp("39 12"), /Numero WhatsApp non valido/);
});
