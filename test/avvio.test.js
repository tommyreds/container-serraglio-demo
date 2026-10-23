import { test } from "node:test";
import assert from "node:assert/strict";
import { controlliAvvio } from "../server/avvio.js";

const base = { produzione: false, host: "127.0.0.1", tunnel: false, baseUrl: "", pinPredefinito: false };

test("in locale si parte anche con il PIN predefinito", () => assert.equal(controlliAvvio({ ...base, pinPredefinito: true }), null));

test("PIN predefinito rifiutato appena il sito è raggiungibile da altri", () => {
  for (const caso of [{ host: "0.0.0.0" }, { tunnel: true }, { produzione: true, baseUrl: "https://x.it" }]) {
    assert.match(controlliAvvio({ ...base, ...caso, pinPredefinito: true }), /PIN predefinito/, JSON.stringify(caso));
  }
});

test("in produzione serve BASE_URL https", () => {
  assert.match(controlliAvvio({ ...base, produzione: true }), /BASE_URL/);
  assert.match(controlliAvvio({ ...base, produzione: true, baseUrl: "http://x.it" }), /BASE_URL/);
  assert.equal(controlliAvvio({ ...base, produzione: true, baseUrl: "https://x.it" }), null);
});
