/* Pezzi d'interfaccia del pannello, uguali in tutte le schermate. */

import { escapeHtml } from "../lib/escape.js";

export const e = escapeHtml;
export const $ = (s, dentro = document) => dentro.querySelector(s);
export const $$ = (s, dentro = document) => [...dentro.querySelectorAll(s)];

const ora = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/* Ogni salvataggio dice "Salvato · 10:14": senza, chi usa il pannello
   ripete l'operazione per sicurezza. Gli errori restano finché non si
   tocca di nuovo qualcosa. */
let timer;
export function mostraEsito(testo = "Salvato") {
  const el = $("#esito");
  el.textContent = `${testo} · ${ora()}`;
  el.classList.remove("errore");
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, 4000);
}

export function mostraErrore(testo) {
  const el = $("#esito");
  el.textContent = testo;
  el.classList.add("errore");
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, 9000);
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
    <input type="checkbox" role="switch" id="${e(id)}"${acceso ? " checked" : ""}>
    <span class="leva" aria-hidden="true"></span>
    <span class="testo">${e(etichetta)}${aiuto ? `<small>${e(aiuto)}</small>` : ""}</span>
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
