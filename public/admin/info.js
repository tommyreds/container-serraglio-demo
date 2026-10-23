/* Schermata Info: le cose che cambiano di rado.
   Ogni riquadro ha il suo "Salva", così un errore in un campo non blocca
   il resto. Le frasi d'errore arrivano dal server già in italiano. */

import { api } from "./api.js";
import { $, $$, e, salva, mostraErrore, conferma, campo, interruttore } from "./ui.js";
import { linkWhatsApp } from "../lib/whatsapp.js";

const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const DATA = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const dataLunga = d => { const [a, m, g] = d.split("-").map(Number); return DATA.format(new Date(Date.UTC(a, m - 1, g))); };
const QUANDO = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* Un riquadro di impostazioni: campi di testo e un pulsante che salva solo quelli. */
function riquadro({ id, titolo, guida = "", campi, extra = "" }) {
  return `<section class="blocco" aria-labelledby="t-${id}">
    <h2 id="t-${id}">${e(titolo)}</h2>
    ${guida ? `<p class="guida">${e(guida)}</p>` : ""}
    <form id="modulo-${id}" data-impostazioni novalidate>
      ${campi.join("")}
      ${extra}
      <button type="submit" class="grosso">Salva</button>
    </form>
  </section>`;
}

export function disegnaInfo(el, dati, ricarica, esci) {
  const imp = dati.impostazioni;
  const c = (id, etichetta, opzioni = {}) => campo({ id, etichetta, valore: imp[id] ?? "", ...opzioni });

  el.innerHTML = `
    <section class="blocco" aria-labelledby="t-orari">
      <h2 id="t-orari">Orari della settimana</h2>
      <form id="modulo-orari" novalidate>
        ${dati.orari.map(o => `<div class="riga-orario">
          ${interruttore({ id: `aperto-${o.giorno}`, etichetta: GIORNI[o.giorno], acceso: !!o.apertura })}
          <div class="ore" id="ore-${o.giorno}"${o.apertura ? "" : " hidden"}>
            <div><label class="etichetta-ora" for="apre-${o.giorno}">Apre<span class="solo-lettori"> ${GIORNI[o.giorno]}</span></label>
              <input type="time" id="apre-${o.giorno}" value="${e(o.apertura || "10:00")}"></div>
            <div><label class="etichetta-ora" for="chiude-${o.giorno}">Chiude<span class="solo-lettori"> ${GIORNI[o.giorno]}</span></label>
              <input type="time" id="chiude-${o.giorno}" value="${e(o.chiusura || "15:00")}"></div>
          </div>
        </div>`).join("")}
        <button type="submit" class="grosso">Salva gli orari</button>
      </form>
    </section>

    <section class="blocco" aria-labelledby="t-chiusure">
      <h2 id="t-chiusure">Giorni di chiusura</h2>
      <p class="guida">Feste, ferie, imprevisti: il sito li mostra e in quei giorni non accetta ordini.</p>
      ${dati.chiusure.length ? `<ul class="lista-semplice">${dati.chiusure.map(ch => `<li>
        <span>${e(dataLunga(ch.data))}${ch.motivo ? ` · ${e(ch.motivo)}` : ""}</span>
        <button type="button" class="grosso secondario" data-togli-chiusura="${e(ch.data)}">Togli</button></li>`).join("")}</ul>`
        : '<p class="guida">Nessuna chiusura in programma.</p>'}
      <form id="modulo-chiusura" novalidate>
        ${campo({ id: "data-chiusura", etichetta: "Giorno", tipo: "date", attributi: `min="${e(dati.oggi)}"` })}
        ${campo({ id: "motivo-chiusura", etichetta: "Motivo (facoltativo)", attributi: 'maxlength="60" placeholder="Es. Ferie"' })}
        <button type="submit" class="grosso secondario">Aggiungi la chiusura</button>
      </form>
    </section>

    ${riquadro({ id: "contatti", titolo: "Contatti", campi: [
      c("telefono", "Telefono", { tipo: "tel" }),
      c("whatsapp", "Numero WhatsApp per gli ordini", { tipo: "tel", aiuto: "Con il prefisso, es. 39 327 053 6624. Gli ordini arrivano qui." }),
      c("indirizzo", "Indirizzo"),
      c("email", "Email", { tipo: "email" }),
      c("instagram", "Link Instagram", { tipo: "url" }),
      c("facebook", "Link Facebook", { tipo: "url" })
    ], extra: '<button type="button" class="grosso secondario" id="prova-whatsapp">Prova il numero WhatsApp</button>' })}

    ${riquadro({ id: "google", titolo: "Recensioni Google", guida: "Il sito mostra voto e numero di recensioni con la data dell'ultimo aggiornamento.", campi: [
      c("google_voto", "Voto", { attributi: 'inputmode="decimal" placeholder="Es. 4,7"' }),
      c("google_recensioni", "Numero di recensioni", { attributi: 'inputmode="numeric"' }),
      c("google_link", "Link alla scheda Google", { tipo: "url" })
    ], extra: `<details class="aiuto-dettagli"><summary>Dove trovo questi dati?</summary>
      <p class="guida">Apri il profilo su Google Maps: voto e numero di recensioni sono sotto il nome del locale. Per il link tocca «Condividi» e copia.</p></details>
      ${imp.google_aggiornato ? `<p class="aiuto">Ultimo aggiornamento: ${e(imp.google_aggiornato.split("-").reverse().join("/"))}</p>` : ""}` })}

    ${riquadro({ id: "legali", titolo: "Dati del locale", guida: "Obbligatori per legge nel piede del sito. Finché mancano, il sito mostra «dato da completare».", campi: [
      c("ragione_sociale", "Ragione sociale"),
      c("piva", "Partita IVA", { attributi: 'inputmode="numeric" maxlength="11"' }),
      c("codice_fiscale", "Codice fiscale"),
      c("rea", "Numero REA (se c'è)"),
      c("pec", "PEC", { tipo: "email" }),
      c("titolare_trattamento", "Titolare del trattamento dati", { aiuto: "Chi risponde dei dati personali, di solito il locale stesso." })
    ], extra: `<label class="spunta"><input type="checkbox" id="allergeni_verificati"${imp.allergeni_verificati === "1" ? " checked" : ""}> Allergeni verificati con la cucina</label>` })}

    ${riquadro({ id: "ritiro", titolo: "Orari di ritiro proposti", campi: [
      c("anticipo_minimo", "Minuti minimi per preparare", { tipo: "number", attributi: 'min="0" max="120" inputmode="numeric"' }),
      `<div class="campo"><label for="passo_fascia">Un orario ogni</label>
        <select id="passo_fascia">${[5, 10, 15, 20, 30].map(n => `<option value="${n}"${String(n) === imp.passo_fascia ? " selected" : ""}>${n} minuti</option>`).join("")}</select></div>`
    ] })}

    <section class="blocco" aria-labelledby="t-sicurezza">
      <h2 id="t-sicurezza">Sicurezza</h2>
      <form id="modulo-pin" novalidate>
        ${campo({ id: "pin-attuale", etichetta: "PIN attuale", tipo: "password", attributi: 'inputmode="numeric" maxlength="6" autocomplete="current-password"' })}
        ${campo({ id: "pin-nuovo", etichetta: "Nuovo PIN", tipo: "password", attributi: 'inputmode="numeric" maxlength="6" autocomplete="new-password"',
          aiuto: "Sei cifre, non tutte uguali e non in sequenza. Gli altri telefoni dovranno rientrare." })}
        <button type="submit" class="grosso">Cambia il PIN</button>
      </form>
      <h3 class="sotto-titolo">Ultimi accessi</h3>
      <ul class="lista-semplice accessi" id="accessi"><li>Carico…</li></ul>
      <button type="button" class="grosso secondario" id="esci-tutti">Esci da tutti i telefoni</button>
      <button type="button" class="grosso secondario" id="esci">Esci da questo telefono</button>
    </section>

    <section class="blocco" aria-labelledby="t-demo">
      <h2 id="t-demo">Modalità demo</h2>
      <p class="guida">Quando il locale approva il sito, spegni la modalità demo: sparisce il nastro «Demo» e Google può indicizzarlo.</p>
      ${interruttore({ id: "modalita_demo", etichetta: imp.modalita_demo === "1" ? "Demo attiva" : "Sito ufficiale", acceso: imp.modalita_demo === "1" })}
    </section>`;

  /* orari */
  for (const o of dati.orari) {
    $(`#aperto-${o.giorno}`, el).addEventListener("change", ev => { $(`#ore-${o.giorno}`, el).hidden = !ev.target.checked; });
  }
  $("#modulo-orari", el).onsubmit = async ev => {
    ev.preventDefault();
    const orari = dati.orari.map(o => $(`#aperto-${o.giorno}`, el).checked
      ? { apertura: $(`#apre-${o.giorno}`, el).value, chiusura: $(`#chiude-${o.giorno}`, el).value }
      : { apertura: null, chiusura: null });
    if (await salva(() => api("PUT", "/orari", { orari }), "Orari salvati")) await ricarica();
  };

  /* chiusure */
  $("#modulo-chiusura", el).onsubmit = async ev => {
    ev.preventDefault();
    const data = $("#data-chiusura", el).value;
    if (!data) { mostraErrore("Scegli il giorno di chiusura."); return; }
    if (await salva(() => api("POST", "/chiusure", { data, motivo: $("#motivo-chiusura", el).value }), "Chiusura aggiunta")) await ricarica();
  };
  for (const b of $$("[data-togli-chiusura]", el)) {
    b.onclick = async () => {
      if (await salva(() => api("DELETE", `/chiusure/${b.dataset.togliChiusura}`), "Chiusura tolta")) await ricarica();
    };
  }

  /* riquadri di impostazioni */
  for (const f of $$("form[data-impostazioni]", el)) {
    f.onsubmit = async ev => {
      ev.preventDefault();
      const corpo = {};
      for (const x of $$("input, select", f)) {
        if (!x.id || x.type === "file") continue;
        corpo[x.id] = x.type === "checkbox" ? (x.checked ? "1" : "0") : x.value;
      }
      if (await salva(() => api("PATCH", "/impostazioni", corpo))) await ricarica();
    };
  }
  $("#prova-whatsapp", el).onclick = () => {
    const numero = $("#whatsapp", el).value;
    window.open(linkWhatsApp(numero, "Prova dal pannello di Container Serraglio"), "_blank", "noopener");
  };

  /* sicurezza */
  $("#modulo-pin", el).onsubmit = async ev => {
    ev.preventDefault();
    const ok = await salva(() => api("POST", "/pin", { attuale: $("#pin-attuale", el).value, nuovo: $("#pin-nuovo", el).value }), "PIN cambiato");
    $("#pin-attuale", el).value = "";
    $("#pin-nuovo", el).value = "";
    if (ok) caricaAccessi(el);
  };
  $("#esci-tutti", el).onclick = async () => {
    if (!(await conferma("Uscire da tutti i telefoni, compreso questo? Dovrete rifare l'accesso con il PIN.", { si: "Esci da tutti" }))) return;
    if (await salva(() => api("POST", "/logout-tutti", {}), "Uscito da tutti i telefoni")) esci();
  };
  $("#esci", el).onclick = async () => {
    if (await salva(() => api("POST", "/logout", {}), "Uscito")) esci();
  };
  caricaAccessi(el);

  /* demo */
  $("#modalita_demo", el).onchange = async ev => {
    const acceso = ev.target.checked;
    $("#modalita_demo-nome", el).textContent = acceso ? "Demo attiva" : "Sito ufficiale";
    if (!acceso && !(await conferma("Spegnere la modalità demo? Il sito diventa ufficiale e visibile su Google.", { si: "Sì, spegni" }))) {
      ev.target.checked = true;
      $("#modalita_demo-nome", el).textContent = "Demo attiva";
      return;
    }
    if (await salva(() => api("PATCH", "/impostazioni", { modalita_demo: acceso ? "1" : "0" }), acceso ? "Demo attiva" : "Il sito è ufficiale")) {
      dati.impostazioni.modalita_demo = acceso ? "1" : "0";
    } else {
      ev.target.checked = !acceso;
      $("#modalita_demo-nome", el).textContent = acceso ? "Sito ufficiale" : "Demo attiva";
    }
  };
}

async function caricaAccessi(el) {
  const lista = $("#accessi", el);
  try {
    const { accessi } = await api("GET", "/accessi");
    lista.innerHTML = accessi.length ? accessi.map(a => `<li>
      <span>${e(QUANDO.format(new Date(a.quando)))} · ${e(a.dispositivo)} · rete ${e(a.ip_troncato)}</span>
      <span class="${a.esito === "ok" ? "" : "ko"}">${a.esito === "ok" ? "Entrato" : "PIN sbagliato"}</span></li>`).join("")
      : "<li>Nessun accesso registrato.</li>";
  } catch (err) {
    lista.innerHTML = `<li>${e(err.message)}</li>`;
  }
}
