import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLERGENI, validaAllergeni, etichetteAllergeni } from "../public/lib/allergeni.js";

test("i 14 allergeni UE nell'ordine stabilito", () => {
  assert.deepEqual(ALLERGENI.map(a => a.codice), ["glutine", "crostacei", "uova", "pesce", "arachidi", "soia", "latte",
    "frutta_guscio", "sedano", "senape", "sesamo", "solfiti", "lupini", "molluschi"]);
  assert.equal(ALLERGENI.find(a => a.codice === "frutta_guscio").etichetta, "Frutta a guscio");
});
test("validaAllergeni ordina e deduplica", () =>
  assert.deepEqual(validaAllergeni(["latte", "glutine", "latte"]), ["glutine", "latte"]));
test("validaAllergeni rifiuta codici sconosciuti", () =>
  assert.equal(validaAllergeni(["glutine", "noci"]), null));
test("etichetteAllergeni", () =>
  assert.deepEqual(etichetteAllergeni("frutta_guscio,boh,latte"), ["Latte", "Frutta a guscio"]));
test("etichetteAllergeni con stringa vuota", () =>
  assert.deepEqual(etichetteAllergeni(""), []));
