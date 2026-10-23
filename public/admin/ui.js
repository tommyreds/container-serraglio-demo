/* Pezzi d'interfaccia del pannello, uguali in tutte le schermate. */

import { escapeHtml } from "../lib/escape.js";

export const e = escapeHtml;
export const $ = (s, dentro = document) => dentro.querySelector(s);
export const $$ = (s, dentro = document) => [...dentro.querySelectorAll(s)];

const ora = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/* Ogni salvataggio dice "Salvato · 10:14": senza, chi usa il pannello
   ripete l'operazione per sicurezza. Gli errori usano role="alert".
   Le regioni restano sempre nel documento (vuote = invisibili): il testo si
   scrive al fotogramma dopo, così i lettori di schermo lo annunciano anche
   quando è uguale al precedente. */
const timer = {};
function scrivi(id, testo, durata) {
  const el = $(`#${id}`);
  clearTimeout(timer[id]);
  el.textContent = "";
  requestAnimationFrame(() => { el.textContent = testo; });
  timer[id] = setTimeout(() => { el.textContent = ""; }, durata);
}
export function mostraEsito(testo = "Salvato") {
  $("#esito-errore").textContent = "";
  scrivi("esito", `${testo} · ${ora()}`, 4000);
}
export function mostraErrore(testo) {
  $("#esito").textContent = "";
  scrivi("esito-errore", testo, 12000);
}

/* Esegue un salvataggio e mostra l'esito; restituisce true se è andato. */
export async function salva(azione, testo = "Salvato") {
  try {
    await azione();
    mostraEsito(testo);
    return true;
  } catch (err) {
    mostraErrore(err.message);
    return false;
  }
}

export function conferma(testo, { si = "Sì", no = "Annulla" } = {}) {
  const d = $("#conferma");
  $("#testo-conferma").textContent = testo;
  $("#conferma-si").textContent = si;
  $("#conferma-no").textContent = no;
  d.showModal();
  $("#conferma-no").focus();
  return new Promise(risolvi => {
    const fine = esito => () => { d.close(); risolvi(esito); };
    $("#conferma-si").onclick = fine(true);
    $("#conferma-no").onclick = fine(false);
    d.oncancel = fine(false);
  });
}

/* Interruttore grande: un checkbox vero con role="switch", così funziona
   con la tastiera e i lettori di schermo senza codice in più. */
export function interruttore({ id, etichetta, acceso, aiuto = "" }) {
  return `<label class="interruttore" for="${e(id)}">
    <input type="checkbox" role="switch" id="${e(id)}"${acceso ? " checked" : ""}${aiuto ? ` aria-describedby="${e(id)}-aiuto"` : ""}>
    <span class="leva" aria-hidden="true"></span>
    <span class="testo"><span id="${e(id)}-nome">${e(etichetta)}</span>${aiuto ? `<small id="${e(id)}-aiuto">${e(aiuto)}</small>` : ""}</span>
  </label>`;
}

export function campo({ id, etichetta, valore = "", tipo = "text", aiuto = "", attributi = "" }) {
  const controllo = tipo === "textarea"
    ? `<textarea id="${e(id)}" name="${e(id)}" ${attributi}>${e(valore)}</textarea>`
    : `<input id="${e(id)}" name="${e(id)}" type="${e(tipo)}" value="${e(valore)}" ${attributi}>`;
  return `<div class="campo">
    <label for="${e(id)}">${e(etichetta)}</label>
    ${controllo}
    ${aiuto ? `<p class="aiuto">${e(aiuto)}</p>` : ""}
  </div>`;
}

export const euroBreve = n =>
  `${Number(n).toLocaleString("it-IT", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
