/* Container Serraglio — pannello del locale
   ------------------------------------------------------------------
   Pensato per il telefono del titolare, in piedi, con una mano sola.
   Tre schermate: Oggi (le cose di ogni mattina), Menù, Info.
   La sessione è un cookie HttpOnly: per sapere se siamo dentro si
   chiede al server. Ogni salvataggio mostra "Salvato · ora".
   ------------------------------------------------------------------ */

import { api, allaScadenza } from "./admin/api.js";
import { $, $$, e, salva, interruttore } from "./admin/ui.js";
import { disegnaMenu } from "./admin/menu.js";
import { disegnaInfo } from "./admin/info.js";

const TITOLI = { oggi: "Oggi", menu: "Menù", info: "Info" };
const stato = { dati: null, schermata: "oggi" };

/* ---------- accesso ---------- */

function mostraAccesso() {
  $("#lavoro").hidden = true;
  $("#accesso").hidden = false;
  for (const d of $$("dialog[open]")) d.close();
  $("#pin").value = "";
  $("#pin").focus();
}

async function entra() {
  const pin = $("#pin").value.trim();
  const errore = $("#errore-accesso");
  if (!/^\d{6}$/.test(pin)) {
    errore.textContent = "Il PIN è di sei cifre.";
    errore.hidden = false;
    return;
  }
  $("#entra").disabled = true;
  try {
    await api("POST", "/login", { pin });
    errore.hidden = true;
    await avvia();
  } catch (err) {
    errore.textContent = err.message;
    errore.hidden = false;
    $("#pin").value = "";
    $("#pin").focus();
  } finally {
    $("#entra").disabled = false;
  }
}

$("#pin").addEventListener("input", () => {
  $("#pin").value = $("#pin").value.replace(/\D/g, "").slice(0, 6);
  if ($("#pin").value.length === 6) entra();   // alla sesta cifra si entra da soli
});
$("#entra").addEventListener("click", entra);
allaScadenza(mostraAccesso);

/* ---------- schermate ---------- */

async function ricarica() {
  stato.dati = await api("GET", "/menu");
  disegna();
}

function disegna() {
  const s = stato.schermata;
  $("#titolo-schermata").textContent = TITOLI[s];
  for (const nome of Object.keys(TITOLI)) $(`#schermata-${nome}`).hidden = nome !== s;
  for (const b of $$(".barra-nav button")) {
    if (b.dataset.schermata === s) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  }
  const contenitore = $(`#schermata-${s}`);
  if (s === "oggi") disegnaOggi(contenitore);
  if (s === "menu") disegnaMenu(contenitore, stato.dati, ricarica);
  if (s === "info") disegnaInfo(contenitore, stato.dati, ricarica, mostraAccesso);
}

for (const b of $$(".barra-nav button")) {
  b.addEventListener("click", () => {
    stato.schermata = b.dataset.schermata;
    disegna();
    window.scrollTo(0, 0);
  });
}

/* ---------- Oggi ----------
   Le quattro cose che cambiano ogni giorno, in ordine di frequenza. */

function disegnaOggi(el) {
  const { oggi, impostazioni: imp, chiusure, categorie } = stato.dati;
  const chiusoOggi = chiusure.some(c => c.data === oggi);
  const attivi = imp.ordini_attivi === "1";
  const primo = categorie.find(c => c.id === "primi")?.prodotti[0];

  el.innerHTML = `
    ${imp.allergeni_verificati !== "1" ? `<p class="banner">Gli allergeni del menù sono dati di esempio. Verificali con la cucina, poi spunta «Allergeni verificati» in <button type="button" class="link" data-vai="info">Info</button>.</p>` : ""}

    <section class="blocco blocco-ordini${attivi ? "" : " in-pausa"}" aria-labelledby="t-ordini">
      <h2 id="t-ordini">Ordini dal sito</h2>
      ${interruttore({ id: "ordini-attivi", etichetta: attivi ? "Attivi" : "In pausa", acceso: attivi,
        aiuto: attivi ? "Gli studenti possono mandare ordini su WhatsApp." : "Il sito si vede ma non lascia ordinare." })}
    </section>

    <section class="blocco" aria-labelledby="t-chiuso">
      <h2 id="t-chiuso">${chiusoOggi ? "Oggi risulti chiuso" : "Oggi sei aperto?"}</h2>
      <p class="guida">${chiusoOggi ? "Il sito dice «Chiuso oggi» e non accetta ordini." : "Se oggi non apri, toccalo: il sito lo dice subito."}</p>
      <button type="button" class="grosso ${chiusoOggi ? "" : "secondario"}" id="chiuso-oggi">${chiusoOggi ? "Riapri oggi" : "Oggi siamo chiusi"}</button>
    </section>

    ${primo ? `<section class="blocco" aria-labelledby="t-primo">
      <h2 id="t-primo">Primo del giorno</h2>
      <label class="guida" for="primo">Scrivi cosa c'è oggi: compare subito sul sito.</label>
      <input id="primo" type="text" maxlength="200" value="${e(primo.descrizione)}" placeholder="Es. Pasta al ragù">
      <button type="button" class="grosso" id="salva-primo">Salva il primo</button>
    </section>` : ""}

    <section class="blocco" aria-labelledby="t-finiti">
      <h2 id="t-finiti">Cosa c'è oggi</h2>
      <p class="guida">Spegni quello che è finito. Domattina torna disponibile da solo.</p>
      ${categorie.map(c => {
        const visibili = c.prodotti.filter(p => p.disponibile);
        return visibili.length ? `<h3 class="sotto-titolo">${e(c.nome)}</h3>
          <div class="elenco-interruttori">${visibili.map(p => interruttore({
            id: `disp-${p.id}`, etichetta: p.nome, acceso: !p.finito })).join("")}</div>` : "";
      }).join("")}
    </section>`;

  $("[data-vai]", el)?.addEventListener("click", ev => {
    stato.schermata = ev.target.dataset.vai;
    disegna();
  });

  $("#ordini-attivi", el).addEventListener("change", async ev => {
    const acceso = ev.target.checked;
    const ok = await salva(() => api("PATCH", "/impostazioni", { ordini_attivi: acceso ? "1" : "0" }),
      acceso ? "Ordini attivi" : "Ordini in pausa");
    if (ok) imp.ordini_attivi = acceso ? "1" : "0"; else ev.target.checked = !acceso;
    disegnaOggi(el);
    $("#ordini-attivi", el).focus();
  });

  $("#chiuso-oggi", el).addEventListener("click", async () => {
    const ok = await salva(() => chiusoOggi
      ? api("DELETE", `/chiusure/${oggi}`)
      : api("POST", "/chiusure", { data: oggi, motivo: "" }), chiusoOggi ? "Riaperto per oggi" : "Chiuso per oggi");
    if (ok) await ricarica();
    $("#chiuso-oggi")?.focus();
  });

  $("#salva-primo", el)?.addEventListener("click", async () => {
    const descrizione = $("#primo", el).value;
    if (await salva(() => api("PUT", "/primo", { descrizione }), "Primo salvato")) {
      primo.descrizione = descrizione;
      primo.finito = false;
    }
  });

  for (const c of categorie) for (const p of c.prodotti) {
    const sw = $(`#disp-${CSS.escape(p.id)}`, el);
    sw?.addEventListener("change", async () => {
      const disponibile = sw.checked;
      const ok = await salva(() => api("PUT", `/prodotti/${encodeURIComponent(p.id)}/finito`, { finito: !disponibile }),
        disponibile ? `${p.nome}: disponibile` : `${p.nome}: finito per oggi`);
      if (ok) p.finito = !disponibile; else sw.checked = !disponibile;
    });
  }
}

/* ---------- avvio ---------- */

async function avvia() {
  $("#accesso").hidden = true;
  $("#lavoro").hidden = false;
  await ricarica();
}

try {
  await api("GET", "/stato");
  await avvia();
} catch {
  mostraAccesso();
}
