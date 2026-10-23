/* I 14 allergeni dell'allegato II del Reg. UE 1169/2011.
   Nel database si salvano solo i codici: le etichette stanno qui, una volta. */

export const ALLERGENI = Object.freeze([
  ["glutine", "Glutine"], ["crostacei", "Crostacei"], ["uova", "Uova"], ["pesce", "Pesce"],
  ["arachidi", "Arachidi"], ["soia", "Soia"], ["latte", "Latte"], ["frutta_guscio", "Frutta a guscio"],
  ["sedano", "Sedano"], ["senape", "Senape"], ["sesamo", "Sesamo"], ["solfiti", "Solfiti"],
  ["lupini", "Lupini"], ["molluschi", "Molluschi"]
].map(([codice, etichetta]) => Object.freeze({ codice, etichetta })));

const ORDINE = new Map(ALLERGENI.map((a, i) => [a.codice, i]));

/* Ripulisce una lista arrivata dal pannello: null se c'è un codice ignoto. */
export function validaAllergeni(lista) {
  if (!Array.isArray(lista) || lista.some(c => !ORDINE.has(c))) return null;
  return [...new Set(lista)].sort((a, b) => ORDINE.get(a) - ORDINE.get(b));
}

export function etichetteAllergeni(csv) {
  const codici = String(csv ?? "").split(",").map(s => s.trim()).filter(c => ORDINE.has(c));
  return [...new Set(codici)].sort((a, b) => ORDINE.get(a) - ORDINE.get(b))
    .map(c => ALLERGENI[ORDINE.get(c)].etichetta);
}
