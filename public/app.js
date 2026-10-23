/* Container Serraglio — vetrina
   ------------------------------------------------------------------
   La pagina arriva già completa dal server; qui si aggiunge il vassoio.
   Il vassoio vive solo nel browser (localStorage): il sito non riceve
   ordini, compone il messaggio e apre WhatsApp verso il locale.
   Orari e messaggio usano le stesse funzioni del server (lib/).
   ------------------------------------------------------------------ */

import { statoApertura, orariRitiro, testoStato } from "./lib/orari.js";
import { componiMessaggio, linkWhatsApp, euro, pulisci } from "./lib/whatsapp.js";
import { escapeHtml as e } from "./lib/escape.js";
import { etichetteAllergeni } from "./lib/allergeni.js";
import "./movimento.js";

const $ = (s, dentro = document) => dentro.querySelector(s);
const $$ = (s, dentro = document) => [...dentro.querySelectorAll(s)];

const iniziali = JSON.parse($("#dati").textContent);
let { orari, chiusure, impostazioni: imp, prodotti } = iniziali;
const CHIAVE = "cs-vassoio";
const MAX_PEZZI = 20;
const TOLTI = "Alcuni prodotti non sono più disponibili e li abbiamo tolti dal vassoio.";
const adesso = () => new Date();
const movimentoRidotto = matchMedia("(prefers-reduced-motion: reduce)");

const barra = $("#barra-vassoio");
const foglio = $("#foglio-vassoio");
const dettaglio = $("#foglio-dettaglio");
const invia = $("#invia-whatsapp");
const campoNome = $("#nome-ritiro");
const campoOra = $("#ora-ritiro");
const campoNote = $("#note");

/* ---------- vassoio ---------- */

function leggiVassoio() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function salvaVassoio() {
  try { localStorage.setItem(CHIAVE, JSON.stringify(vassoio)); } catch { /* navigazione privata: pazienza */ }
}
let vassoio = leggiVassoio();

/* Toglie quello che non si può più ordinare (prodotto sparito o finito) e
   rimette in riga le quantità. true se qualcosa è stato tolto. */
function ripulisci() {
  let tolto = false;
  for (const [id, q] of Object.entries(vassoio)) {
    const n = Math.min(MAX_PEZZI, Math.floor(Number(q)));
    if (!Object.hasOwn(prodotti, id) || prodotti[id].finito || !(n >= 1)) { delete vassoio[id]; tolto = true; }
    else vassoio[id] = n;
  }
  salvaVassoio();
  return tolto;
}

const righe = () => Object.entries(vassoio).map(([id, quantita]) => ({ id, quantita, ...prodotti[id] }));
const pezzi = () => righe().reduce((a, r) => a + r.quantita, 0);
const totale = () => righe().reduce((a, r) => a + r.quantita * r.prezzo_finale, 0);
const contaPezzi = n => `${n} ${n === 1 ? "pezzo" : "pezzi"}`;

function annuncia(testo) {
  // con un foglio aperto il resto della pagina è inerte: si parla da dentro il foglio
  const zona = foglio.open ? $("#annunci-vassoio") : $("#annunci");
  zona.textContent = "";
  requestAnimationFrame(() => { zona.textContent = testo; });
}

function avvisa(testo) {
  const a = $("#avviso-vassoio");
  a.textContent = testo;
  a.hidden = !testo;
}

function cambia(id, delta, da) {
  const p = prodotti[id];
  if (!p || p.finito) return;
  const prima = vassoio[id] || 0;
  const dopo = Math.max(0, Math.min(MAX_PEZZI, prima + delta));
  if (dopo === prima) return;
  if (dopo === 0) delete vassoio[id]; else vassoio[id] = dopo;
  salvaVassoio();
  aggiornaTutto();
  if (delta > 0) document.dispatchEvent(new CustomEvent("vassoio:aggiunto", { detail: { da } }));
  annuncia(`${delta > 0 ? "Aggiunto" : "Tolto"}: ${p.nome}. Vassoio: ${contaPezzi(pezzi())}, ${euro(totale())}.`);
}

/* ---------- disegno ---------- */

function aggiornaSchede() {
  for (const scheda of $$(".scheda")) {
    // un prodotto tolto o finito dopo il caricamento della pagina non si può più aggiungere
    const p = prodotti[scheda.dataset.id];
    if ((!p || p.finito) && !scheda.classList.contains("finito")) {
      scheda.classList.add("finito");
      $(".piu", scheda).disabled = true;
      const etichetta = document.createElement("span");
      etichetta.className = "etichetta-finito";
      etichetta.textContent = p ? "Finito per oggi" : "Non disponibile";
      $(".scheda-media", scheda).after(etichetta);
    }
    const q = vassoio[scheda.dataset.id] || 0;
    let segno = $(".quanti", scheda);
    if (q && !segno) {
      segno = document.createElement("span");
      segno.className = "quanti";
      $(".scheda-media", scheda).append(segno);
    }
    if (segno) {
      if (q) segno.textContent = `${q}×`; else segno.remove();
    }
  }
}

function aggiornaBarra() {
  const n = pezzi();
  barra.hidden = n === 0;
  barra.dataset.pezzi = String(n);
  $(".conta", barra).textContent = String(n);
  $(".totale", barra).textContent = euro(totale());
  barra.setAttribute("aria-label", `Apri il vassoio: ${contaPezzi(n)}, ${euro(totale())}`);
  document.dispatchEvent(new CustomEvent("vassoio:totale", { detail: { el: $(".totale", barra), valore: totale() } }));
}

function disegnaRighe() {
  const lista = $("#righe-vassoio");
  // ricostruire la lista distrugge il pulsante appena premuto: si ricorda e si rimette il focus
  const attivo = document.activeElement?.closest?.("#righe-vassoio li[data-id] button");
  const ricorda = attivo && { id: attivo.closest("li").dataset.id, piu: attivo.hasAttribute("data-piu") };
  lista.innerHTML = pezzi()
    ? righe().map(r => `<li data-id="${e(r.id)}">
      <span class="nome">${e(r.nome)}<small>${e(euro(r.prezzo_finale))} l'uno</small></span>
      <span class="passo-q">
        <button type="button" data-meno aria-label="Togli un ${e(r.nome)}">−</button>
        <output aria-label="Quantità">${r.quantita}</output>
        <button type="button" data-piu aria-label="Aggiungi un ${e(r.nome)}"${r.quantita >= MAX_PEZZI ? " disabled" : ""}>+</button>
      </span></li>`).join("")
    : '<li class="vuoto">Il vassoio è vuoto: aggiungi qualcosa dal menù.</li>';
  $("#totale-vassoio").textContent = euro(totale());
  if (ricorda) {
    const riga = $(`li[data-id="${CSS.escape(ricorda.id)}"]`, lista);
    const bersaglio = riga ? $(ricorda.piu ? "[data-piu]" : "[data-meno]", riga) : ($("li[data-id] [data-meno]", lista) || campoNome);
    (bersaglio?.disabled ? $("[data-meno]", riga) : bersaglio)?.focus();
  }
}

function aggiornaTutto() {
  aggiornaSchede();
  aggiornaBarra();
  if (foglio.open) { disegnaRighe(); aggiornaInvio(); }
}

/* ---------- orari di ritiro e invio ---------- */

function fasce() {
  return orariRitiro({
    orari, chiusure, now: adesso(),
    anticipo: Number(imp.anticipo_minimo) || 15, passo: Number(imp.passo_fascia) || 10
  });
}

/* L'elenco si ricostruisce solo quando cambia davvero (altrimenti il
   selettore aperto sul telefono si chiuderebbe ogni minuto). Se l'orario
   scelto non c'è più, non lo si sostituisce in silenzio: si avvisa e il
   prossimo tocco su Invia si ferma finché lo studente non conferma. */
const SCADUTA = "L'orario che avevi scelto è passato: controlla quello nuovo e tocca di nuovo Invia.";
let sceltaScaduta = false;

function popolaOrari() {
  const scelta = campoOra.value;
  const elenco = fasce();
  const chiave = elenco.join(",");
  if (campoOra.dataset.elenco !== chiave) {
    campoOra.innerHTML = elenco.map(o => `<option value="${o}">${o}</option>`).join("");
    campoOra.dataset.elenco = chiave;
    if (elenco.includes(scelta)) campoOra.value = scelta;
    else if (scelta && elenco.length) { sceltaScaduta = true; avvisa(SCADUTA); }
  }
  campoOra.disabled = elenco.length === 0;
  return { elenco };
}

campoOra.addEventListener("change", () => {
  sceltaScaduta = false;
  if ($("#avviso-vassoio").textContent === SCADUTA) avvisa("");
});

/* Si può ordinare anche prima dell'apertura, per un orario di oggi.
   Non si può con ordini sospesi, nei giorni di chiusura o senza orari. */
let verificando = false;
function motivoBlocco(elenco) {
  if (verificando) return "Controllo cosa è ancora disponibile…";
  if (imp.ordini_attivi !== "1") return "Ordini sospesi in questo momento.";
  if (elenco.length) return null;
  const stato = statoApertura({ orari, chiusure, now: adesso() });
  if (stato.aperto) return "Per oggi non ci sono più orari di ritiro.";
  return stato.riapre ? `Siamo chiusi — ordina ${stato.riapre.etichetta}.` : "Siamo chiusi.";
}

function messaggio() {
  return componiMessaggio({
    nome: campoNome.value, ora: campoOra.value, note: campoNote.value, demo: imp.modalita_demo === "1",
    righe: righe().map(r => ({ nome: r.nome, quantita: r.quantita, prezzo: r.prezzo_finale }))
  });
}

function aggiornaInvio() {
  const { elenco } = popolaOrari();
  const motivo = pezzi() ? motivoBlocco(elenco) : "Aggiungi almeno un prodotto.";
  const m = $("#motivo-blocco");
  m.textContent = motivo || "";
  m.hidden = !motivo;
  if (motivo) {
    // resta un link con href: raggiungibile da tastiera, e il tocco viene fermato dal gestore
    invia.setAttribute("aria-disabled", "true");
    invia.href = "#";
  } else {
    invia.removeAttribute("aria-disabled");
    invia.href = linkWhatsApp(imp.whatsapp, messaggio());
  }
}

function erroreNome(testo) {
  const p = $("#errore-nome");
  p.textContent = testo;
  p.hidden = !testo;
  campoNome.setAttribute("aria-invalid", testo ? "true" : "false");
}

invia.addEventListener("click", evento => {
  // ricontrollo al momento del tocco: il foglio può essere rimasto aperto a lungo
  aggiornaInvio();
  if (invia.getAttribute("aria-disabled") === "true") { evento.preventDefault(); return; }
  if (sceltaScaduta) {
    evento.preventDefault();
    sceltaScaduta = false;   // il secondo tocco, dopo aver visto l'avviso, invia
    campoOra.focus();
    return;
  }
  const nome = campoNome.value.trim();
  // conta il nome come arriverà nel messaggio, senza i simboli che WhatsApp toglie
  if ([...pulisci(nome, 40)].length < 2) {
    evento.preventDefault();
    erroreNome("Scrivi il nome per il ritiro.");
    campoNome.focus();
    return;
  }
  erroreNome("");
  try { localStorage.setItem("cs-nome", nome); } catch { /* facoltativo */ }
  setTimeout(() => { $("#chiedi-svuota").hidden = false; }, 600);
});

for (const campo of [campoNome, campoOra, campoNote]) {
  campo.addEventListener("input", () => { if (campo === campoNome) erroreNome(""); aggiornaInvio(); });
}

$("#svuota-si").addEventListener("click", () => {
  vassoio = {};
  salvaVassoio();
  $("#chiedi-svuota").hidden = true;
  campoNote.value = "";
  foglio.close();
  aggiornaTutto();
  annuncia("Vassoio svuotato.");
});
$("#svuota-no").addEventListener("click", () => { $("#chiedi-svuota").hidden = true; });

/* ---------- apertura del vassoio ---------- */

/* Rilegge il menù prima di lasciar inviare: un prodotto può essere finito o
   cambiato prezzo da quando la pagina è stata aperta. Massimo 4 secondi,
   poi si va avanti con i dati della pagina. true se un prezzo è cambiato. */
async function aggiornaDalServer() {
  try {
    const segnale = AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined;
    const r = await fetch("api/menu", { headers: { Accept: "application/json" }, cache: "no-store", signal: segnale });
    if (!r.ok) return false;
    const m = await r.json();
    orari = m.orari;
    chiusure = m.chiusure.map(c => c.data);
    imp = m.impostazioni;
    const nuovi = {};
    for (const c of m.categorie) for (const p of c.prodotti) {
      nuovi[p.id] = {
        nome: p.nome, categoria: c.nome, descrizione: p.descrizione, prezzo_finale: p.prezzo_finale, finito: p.finito,
        foto: p.foto, allergeni: etichetteAllergeni(p.allergeni.join(",")), surgelati: p.surgelati
      };
    }
    const prezzoCambiato = Object.keys(vassoio).some(id => nuovi[id] && prodotti[id] && nuovi[id].prezzo_finale !== prodotti[id].prezzo_finale);
    prodotti = nuovi;
    return prezzoCambiato;
  } catch { return false; /* offline o lento: restano i dati della pagina */ }
}

async function apriVassoio() {
  $("#chiedi-svuota").hidden = true;
  if (!campoNome.value) { try { campoNome.value = localStorage.getItem("cs-nome") || ""; } catch { /* niente */ } }
  verificando = true;
  disegnaRighe();
  aggiornaInvio();
  if (!foglio.open) foglio.showModal();
  const prezzoCambiato = await aggiornaDalServer();
  verificando = false;
  if (ripulisci()) avvisa(TOLTI);
  else if (prezzoCambiato) avvisa("Alcuni prezzi sono cambiati: il totale è già aggiornato.");
  aggiornaTutto();
}

barra.addEventListener("click", apriVassoio);

$("#righe-vassoio").addEventListener("click", evento => {
  const riga = evento.target.closest("li[data-id]");
  if (!riga) return;
  if (evento.target.closest("[data-piu]")) cambia(riga.dataset.id, 1);
  if (evento.target.closest("[data-meno]")) cambia(riga.dataset.id, -1);
});

/* ---------- schede e dettaglio ---------- */

let inDettaglio = null;

function apriDettaglio(scheda) {
  const id = scheda.dataset.id;
  const p = prodotti[id];
  if (!p) return;
  inDettaglio = id;
  const media = $(".scheda-media", scheda).cloneNode(true);
  $(".quanti", media)?.remove();
  $("#titolo-dettaglio").textContent = p.nome;
  $("#corpo-dettaglio").innerHTML = `
    <div class="dettaglio-media">${media.innerHTML}</div>
    <p class="dettaglio-prezzo">${e(p.categoria)} · ${e(euro(p.prezzo_finale))}</p>
    ${p.descrizione ? `<p class="dettaglio-testo">${e(p.descrizione)}</p>` : ""}
    ${p.allergeni.length
      ? `<ul class="allergeni-chip" aria-label="Allergeni">${p.allergeni.map(a => `<li>${e(a)}</li>`).join("")}</ul>`
      : '<p class="dettaglio-testo">Nessun allergene indicato.</p>'}
    ${p.surgelati ? '<p class="dettaglio-testo">* Contiene ingredienti surgelati.</p>' : ""}
    <p class="nota-piccola">Allergie? Scrivilo nelle note: la cucina ti dice cosa evitare.</p>`;
  const bottone = $("#aggiungi-dettaglio");
  bottone.disabled = p.finito;
  bottone.textContent = p.finito ? "Finito per oggi" : "Aggiungi al vassoio";
  dettaglio.showModal();
}

$("#aggiungi-dettaglio").addEventListener("click", () => {
  if (!inDettaglio) return;
  const scheda = $(`.scheda[data-id="${CSS.escape(inDettaglio)}"]`);
  dettaglio.close();
  cambia(inDettaglio, 1, scheda && $(".piu", scheda));
});

document.addEventListener("click", evento => {
  const piu = evento.target.closest(".scheda .piu");
  if (piu) { cambia(piu.closest(".scheda").dataset.id, 1, piu); return; }
  const apri = evento.target.closest(".scheda-apri");
  if (apri) apriDettaglio(apri.closest(".scheda"));
});

/* ---------- fogli: chiusura con la X o toccando fuori ---------- */

for (const d of [foglio, dettaglio]) {
  d.addEventListener("click", evento => {
    if (evento.target === d || evento.target.closest("[data-chiudi]")) d.close();
  });
}

/* ---------- stato di apertura ---------- */

function aggiornaStato() {
  const badge = $("#stato");
  if (!badge) return;
  const s = statoApertura({ orari, chiusure, now: adesso() });
  badge.classList.toggle("aperto", s.aperto);
  $("#stato-testo").textContent = testoStato(s);
}
setInterval(() => { aggiornaStato(); if (foglio.open) aggiornaInvio(); }, 60_000);

/* ---------- categorie e testata ---------- */

const chips = $$(".chips a");
for (const chip of chips) {
  chip.addEventListener("click", evento => {
    const meta = document.querySelector(chip.getAttribute("href"));
    if (!meta) return;
    evento.preventDefault();
    meta.scrollIntoView({ behavior: movimentoRidotto.matches ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", chip.getAttribute("href"));
  });
}

if ("IntersectionObserver" in window) {
  // categoria attiva = l'ultima il cui inizio è già passato sotto la barra delle categorie
  const sezioni = $$(".categoria");
  const segnaAttiva = () => {
    const attiva = sezioni.filter(s => s.getBoundingClientRect().top <= 180).at(-1);
    for (const chip of chips) chip.setAttribute("aria-current", String(!!attiva && chip.getAttribute("href") === `#${attiva.id}`));
  };
  const osservaCategorie = new IntersectionObserver(segnaAttiva, { rootMargin: "-170px 0px -40% 0px", threshold: [0, 1] });
  sezioni.forEach(s => osservaCategorie.observe(s));

  const hero = $(".hero");
  if (hero) new IntersectionObserver(([v]) => $(".testata").classList.toggle("scorre", !v.isIntersecting)).observe(hero);
}

/* ---------- avvio ---------- */

if (ripulisci()) avvisa(TOLTI);
aggiornaTutto();
aggiornaStato();
