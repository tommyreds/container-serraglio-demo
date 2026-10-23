/* Container Serraglio — pannello di gestione
   ------------------------------------------------------------------
   La sessione è un cookie HttpOnly: il JavaScript non può leggerlo,
   quindi per sapere se siamo dentro si chiede al server.
   Ogni modifica si salva subito e mostra una conferma con l'ora: chi
   usa il pannello non deve mai chiedersi se ha salvato.
   ------------------------------------------------------------------ */

const $ = s => document.querySelector(s);
const fuga = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const euro = n => Number(n).toLocaleString("it-IT", { style:"currency", currency:"EUR" });
const oggi = () => new Date().toLocaleDateString("sv-SE");
const adesso = () => new Date().toLocaleTimeString("it-IT", { hour:"2-digit", minute:"2-digit" });
const GIORNI = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];
const STATI = [["in preparazione","In forno"],["pronto","Pronto"],["ritirato","Ritirato"]];

let dati = null;
let scorte = null;

async function api(percorso, opzioni = {}) {
  const r = await fetch(percorso, {
    headers: { "Content-Type": "application/json" },
    ...opzioni,
    body: opzioni.corpo ? JSON.stringify(opzioni.corpo) : undefined
  });
  const risposta = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(risposta.errore || `Errore ${r.status}`);
  return risposta;
}

/* La conferma è parte della funzione, non un dettaglio: senza, chi usa il
   pannello ripete l'operazione per sicurezza. */
let timerEsito;
function conferma(testo) {
  const e = $("#esito");
  e.textContent = `${testo} · ${adesso()}`;
  e.classList.remove("errore");
  e.hidden = false;
  clearTimeout(timerEsito);
  timerEsito = setTimeout(() => { e.hidden = true; }, 4000);
}
function problema(testo) {
  const e = $("#esito");
  e.textContent = testo;
  e.classList.add("errore");
  e.hidden = false;
  clearTimeout(timerEsito);
  timerEsito = setTimeout(() => { e.hidden = true; }, 6000);
}

/* ---------- accesso ---------- */

async function verificaAccesso() {
  try {
    await api("api/admin/stato");
    $("#accesso").hidden = true;
    $("#lavoro").hidden = false;
    await caricaTutto();
  } catch {
    $("#accesso").hidden = false;
    $("#lavoro").hidden = true;
  }
}

async function entra() {
  $("#errore-accesso").hidden = true;
  try {
    await api("api/admin/login", { method:"POST", corpo:{ pin: $("#pin").value } });
    $("#pin").value = "";
    await verificaAccesso();
  } catch (e) {
    $("#errore-accesso").textContent = e.message;
    $("#errore-accesso").hidden = false;
    $("#pin").value = "";
    $("#pin").focus();
  }
}

$("#entra").addEventListener("click", entra);
// sei cifre digitate: si entra da soli, senza premere nulla
$("#pin").addEventListener("input", e => { if (e.target.value.length === 6) entra(); });
$("#pin").addEventListener("keydown", e => { if (e.key === "Enter") entra(); });

$("#esci").addEventListener("click", async () => {
  await api("api/admin/logout", { method:"POST" }).catch(() => {});
  location.reload();
});

/* ---------- navigazione ---------- */

document.querySelector(".barra-nav").addEventListener("click", e => {
  const b = e.target.closest("[data-schermata]");
  if (!b) return;
  document.querySelectorAll(".barra-nav button").forEach(x => x.classList.toggle("attiva", x === b));
  document.querySelectorAll(".schermata").forEach(s => { s.hidden = s.id !== `schermata-${b.dataset.schermata}`; });
  $("#titolo-schermata").textContent = b.textContent.trim();
  if (b.dataset.schermata === "ordini") caricaOrdini().catch(e => problema(e.message));
});

/* ---------- caricamento ---------- */

async function caricaTutto() {
  dati = await api("api/admin/menu");
  scorte = await api(`api/admin/scorte?data=${oggi()}`);
  disegnaPrimo();
  disegnaScorte();
  disegnaDisponibilita();
  disegnaPrezzi();
  disegnaOrari();
  $("#ordini-attivi").checked = dati.impostazioni.ordini_attivi === "1";
  await contaOrdini();
}

/* ---------- primo del giorno ---------- */

function primoPiatto() {
  return dati.categorie.find(c => c.id === "primi")?.prodotti[0] ?? null;
}

function disegnaPrimo() {
  const p = primoPiatto();
  $("#primo").value = p ? p.descrizione : "";
  $("#primo").disabled = !p;
}

$("#salva-primo").addEventListener("click", async () => {
  try {
    await api("api/admin/primo", { method:"PUT", corpo:{ descrizione: $("#primo").value } });
    dati = await api("api/admin/menu");
    disegnaDisponibilita();
    conferma("Primo di oggi aggiornato");
  } catch (e) { problema(e.message); }
});

/* ---------- scorte ---------- */

function disegnaScorte() {
  $("#scorte").innerHTML = dati.categorie.map(c => {
    const s = scorte.categorie[c.id];
    const stato = s.caricati === null
      ? "nessun limite"
      : s.residuo === 0
        ? `<span class="finito">finiti</span> · ${s.venduti} venduti`
        : `${s.residuo} ancora disponibili · ${s.venduti} venduti`;
    return `
      <div class="scorta">
        <div class="scorta-nome">
          <strong>${fuga(c.nome)}</strong>
          <span>${stato}</span>
        </div>
        <div class="passo">
          <button type="button" data-scorta-meno="${c.id}" aria-label="Uno in meno di ${fuga(c.nome)}">−</button>
          <input type="number" min="0" inputmode="numeric" value="${s.caricati ?? ""}" placeholder="—"
                 data-scorta="${c.id}" aria-label="Pezzi di ${fuga(c.nome)}">
          <button type="button" data-scorta-piu="${c.id}" aria-label="Uno in più di ${fuga(c.nome)}">+</button>
        </div>
      </div>`;
  }).join("");
}

async function salvaScorte() {
  const categorie = {};
  document.querySelectorAll("[data-scorta]").forEach(i => { categorie[i.dataset.scorta] = i.value; });
  scorte = await api("api/admin/scorte", { method:"PUT", corpo:{ data: oggi(), categorie } });
  disegnaScorte();
  conferma("Scorte aggiornate");
}

$("#scorte").addEventListener("click", async e => {
  const piu = e.target.closest("[data-scorta-piu]");
  const meno = e.target.closest("[data-scorta-meno]");
  if (!piu && !meno) return;
  const id = (piu || meno).dataset.scortaPiu || (piu || meno).dataset.scortaMeno;
  const campo = document.querySelector(`[data-scorta="${id}"]`);
  const valore = Number(campo.value || 0) + (piu ? 1 : -1);
  campo.value = Math.max(0, valore);
  try { await salvaScorte(); } catch (err) { problema(err.message); }
});
$("#scorte").addEventListener("change", async e => {
  if (e.target.matches("[data-scorta]")) {
    try { await salvaScorte(); } catch (err) { problema(err.message); }
  }
});

$("#copia-ieri").addEventListener("click", async () => {
  const ieri = new Date();
  ieri.setDate(ieri.getDate() - 1);
  try {
    scorte = await api("api/admin/scorte/copia", {
      method:"POST", corpo:{ da: ieri.toLocaleDateString("sv-SE"), a: oggi() }
    });
    disegnaScorte();
    conferma("Copiate le quantità di ieri");
  } catch (e) { problema(e.message); }
});

/* ---------- disponibilità ---------- */

function disegnaDisponibilita() {
  $("#disponibilita").innerHTML = dati.categorie.map(c => c.prodotti.map(p => `
    <label class="interruttore${p.disponibile ? "" : " spento"}">
      <input type="checkbox" data-disponibile="${p.id}" ${p.disponibile ? "checked" : ""}>
      <span class="leva"></span>
      <span class="testo">${fuga(p.nome)}
        <span class="stato">${fuga(c.nome)}${p.disponibile ? "" : " · non è in vendita"}</span>
      </span>
    </label>`).join("")).join("");
}

$("#disponibilita").addEventListener("change", async e => {
  const i = e.target.closest("[data-disponibile]");
  if (!i) return;
  try {
    await api(`api/admin/prodotti/${i.dataset.disponibile}`, {
      method:"PATCH", corpo:{ disponibile: i.checked }
    });
    dati = await api("api/admin/menu");
    disegnaDisponibilita();
    conferma(i.checked ? "Rimesso in vendita" : "Segnato come finito");
  } catch (err) {
    problema(err.message);
    i.checked = !i.checked;
  }
});

/* ---------- ordini ---------- */

async function contaOrdini() {
  try {
    const { ordini } = await api(`api/admin/ordini?data=${oggi()}`);
    const aperti = ordini.filter(o => o.stato === "ricevuto" || o.stato === "in preparazione").length;
    $("#pallino-ordini").hidden = aperti === 0;
  } catch { /* il pallino è un di più */ }
}

async function caricaOrdini() {
  const { ordini } = await api(`api/admin/ordini?data=${oggi()}`);
  $("#ordini").innerHTML = ordini.length === 0
    ? '<p class="vuoto">Nessun ordine per oggi.</p>'
    : ordini.map(o => `
      <article class="ordine ${fuga(o.stato === "pronto" ? "pronto" : o.stato === "ritirato" ? "ritirato" : "")}">
        <div class="ordine-testa">
          <span class="ordine-ora">${fuga(o.ritiro_ora)}</span>
          <span class="ordine-codice">${fuga(o.codice)}</span>
          <span>${fuga(o.nome)}</span>
          <span class="ordine-totale">${euro(o.totale)}</span>
        </div>
        <ul>${o.righe.map(r => `<li>${r.quantita}× ${fuga(r.nome)}</li>`).join("")}</ul>
        ${o.note ? `<p class="ordine-note">Note: ${fuga(o.note)}</p>` : ""}
        <div class="ordine-azioni">
          ${STATI.map(([v, et]) => `
            <button type="button" data-ordine="${o.id}" data-stato="${v}"
                    class="${o.stato === v ? "scelto" : ""}">${et}</button>`).join("")}
        </div>
      </article>`).join("");
  await contaOrdini();
}

$("#ordini").addEventListener("click", async e => {
  const b = e.target.closest("[data-ordine]");
  if (!b) return;
  try {
    await api(`api/admin/ordini/${b.dataset.ordine}`, { method:"PATCH", corpo:{ stato: b.dataset.stato } });
    await caricaOrdini();
    conferma("Ordine aggiornato");
  } catch (err) { problema(err.message); }
});

/* ---------- prezzi ---------- */

function disegnaPrezzi() {
  $("#prezzi").innerHTML = dati.categorie.map(c => `
    <div class="riga-prezzo">
      <span>${fuga(c.nome)}</span>
      <input type="number" step="0.50" min="0" inputmode="decimal" value="${c.prezzo}"
             data-prezzo="${c.id}" aria-label="Prezzo di ${fuga(c.nome)}">
    </div>`).join("");
}

$("#prezzi").addEventListener("change", async e => {
  const i = e.target.closest("[data-prezzo]");
  if (!i) return;
  try {
    await api(`api/admin/categorie/${i.dataset.prezzo}`, { method:"PATCH", corpo:{ prezzo: i.value } });
    dati = await api("api/admin/menu");
    conferma("Prezzo aggiornato");
  } catch (err) { problema(err.message); }
});

/* ---------- orari ---------- */

function disegnaOrari() {
  $("#orari").innerHTML = dati.orari.map(o => `
    <div class="riga-orario" data-giorno="${o.giorno}">
      <span>${GIORNI[o.giorno]}</span>
      <input type="time" value="${o.apertura || ""}" data-campo="apertura" aria-label="Apertura ${GIORNI[o.giorno]}">
      <input type="time" value="${o.chiusura || ""}" data-campo="chiusura" aria-label="Chiusura ${GIORNI[o.giorno]}">
    </div>`).join("");
}

$("#salva-orari").addEventListener("click", async () => {
  const orari = [...document.querySelectorAll("[data-giorno]")].map(r => ({
    giorno: Number(r.dataset.giorno),
    apertura: r.querySelector('[data-campo="apertura"]').value || null,
    chiusura: r.querySelector('[data-campo="chiusura"]').value || null
  }));
  if (orari.some(o => Boolean(o.apertura) !== Boolean(o.chiusura))) {
    return problema("Ogni giorno vuole sia apertura sia chiusura, oppure nessuna delle due.");
  }
  try {
    await api("api/admin/orari", { method:"PUT", corpo:{ orari } });
    conferma("Orari salvati");
  } catch (e) { problema(e.message); }
});

/* ---------- interruttore ordini e PIN ---------- */

$("#ordini-attivi").addEventListener("change", async e => {
  try {
    await api("api/admin/impostazioni", { method:"PATCH", corpo:{ ordini_attivi: e.target.checked ? "1" : "0" } });
    conferma(e.target.checked ? "Ordini riattivati" : "Ordini sospesi");
  } catch (err) {
    problema(err.message);
    e.target.checked = !e.target.checked;
  }
});

$("#cambia-pin").addEventListener("click", async () => {
  try {
    await api("api/admin/pin", { method:"POST", corpo:{ pin: $("#nuovo-pin").value } });
    $("#nuovo-pin").value = "";
    conferma("PIN aggiornato");
  } catch (e) { problema(e.message); }
});

/* gli ordini si ricontrollano da soli: il banco non deve ricaricare */
setInterval(() => { if (!$("#lavoro").hidden) contaOrdini(); }, 60_000);

verificaAccesso();
