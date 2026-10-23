/* Container Serraglio — vetrina con ordini
   ------------------------------------------------------------------
   I dati arrivano dal server (/api/menu, /api/fasce, /api/ordini).
   Se il server non risponde si usa la copia DEMO qui sotto e l'ordine
   viene solo preparato per WhatsApp, senza registrarlo: serve a far
   funzionare la pagina anche pubblicata da sola come dimostrazione.
   Menù, prezzi, orari e scorte si cambiano dal pannello /admin.
   ------------------------------------------------------------------ */

const DEMO = {
  impostazioni: {
    nome_attivita: "Container Serraglio", telefono: "327 053 6624", whatsapp: "393270536624",
    indirizzo: "Via Jean Louise Protche 7/9, 59100 Prato",
    passo_fascia: "10", anticipo_minimo: "15"
  },
  orari: [0,1,2,3,4].map(g => ({ giorno:g, apertura:"10:00", chiusura:"15:00" }))
    .concat([{giorno:5,apertura:null,chiusura:null},{giorno:6,apertura:null,chiusura:null}]),
  categorie: [
    { id:"schiacciate", nome:"Schiacciate", prezzo:6, prodotti:[
      {id:"sc1",nome:"Container Serraglio 1",descrizione:"Crudo, stracciatella, pomodori secchi, rucola.",foto:null,prezzo_finale:6,disponibile:true,residuo:null},
      {id:"sc2",nome:"Container Serraglio 2",descrizione:"Crudo, mozzarella, crema al tartufo.",foto:null,prezzo_finale:6,disponibile:true,residuo:null},
      {id:"al1",nome:"Almanacco 1",descrizione:"Mortadella, pesto di pistacchio, pomodori secchi.",foto:"img/p-grigliata.webp",prezzo_finale:6,disponibile:true,residuo:null},
      {id:"al2",nome:"Almanacco 2",descrizione:"Mortadella, stracciatella, crema di carciofi.",foto:null,prezzo_finale:6,disponibile:true,residuo:null},
      {id:"pg1",nome:"Playground 1",descrizione:"Cotto, crema di carciofi, insalata.",foto:"img/p-panino-cotto.webp",prezzo_finale:6,disponibile:true,residuo:null},
      {id:"pg2",nome:"Playground 2",descrizione:"Cotto, provola, zucchine.",foto:null,prezzo_finale:6,disponibile:true,residuo:null},
      {id:"bi1",nome:"Bischero 1",descrizione:"Sbriciolona, provola, melanzane, insalata.",foto:"img/p-toast-cotto.webp",prezzo_finale:6,disponibile:true,residuo:null},
      {id:"bi2",nome:"Bischero 2",descrizione:"Sbriciolona, crema di carciofi, rucola.",foto:null,prezzo_finale:6,disponibile:true,residuo:null},
      {id:"bis",nome:"Bisenzio",descrizione:"Tonno, pomodoro, maionese, insalata.",foto:null,prezzo_finale:6,disponibile:true,residuo:null},
      {id:"cot",nome:"Panino con cotoletta",descrizione:"",foto:null,prezzo_finale:6,disponibile:true,residuo:null}
    ]},
    { id:"pinsa", nome:"Pinsa", prezzo:7, prodotti:[
      {id:"pi1",nome:"Margherita",descrizione:"",foto:null,prezzo_finale:7,disponibile:true,residuo:null},
      {id:"pi2",nome:"Salamino piccante",descrizione:"",foto:null,prezzo_finale:7,disponibile:true,residuo:null},
      {id:"pi3",nome:"Cotto e wurstel",descrizione:"",foto:"img/p-pinsa-cotto.webp",prezzo_finale:7,disponibile:true,residuo:null},
      {id:"pi4",nome:"Napoli",descrizione:"",foto:null,prezzo_finale:7,disponibile:true,residuo:null},
      {id:"pi5",nome:"Crudo",descrizione:"",foto:null,prezzo_finale:7,disponibile:true,residuo:null}
    ]},
    { id:"griglia", nome:"Hamburgher e hot dog", prezzo:8, prodotti:[
      {id:"hb",nome:"Hamburgher",descrizione:"Con patatine fritte.",foto:"img/p-hamburger.webp",prezzo_finale:8,disponibile:true,residuo:null},
      {id:"hd",nome:"Hot dog",descrizione:"Con patatine fritte.",foto:"img/p-hotdog.webp",prezzo_finale:8,disponibile:true,residuo:null}
    ]},
    { id:"primi", nome:"Primi piatti", prezzo:8, prodotti:[
      {id:"pr1",nome:"Primo piatto",descrizione:"Chiedi al banco la proposta di oggi.",foto:null,prezzo_finale:8,disponibile:true,residuo:null}
    ]}
  ]
};

const GIORNI = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];

let dati = null;
let collegato = false;
let filtro = "tutti";
let ordine = {};
let residui = {};
let dataResidui = null;

const $ = s => document.querySelector(s);
const euro = n => Number(n).toLocaleString("it-IT", { style:"currency", currency:"EUR" });
const fuga = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const min = s => { const [h,m] = s.split(":").map(Number); return h*60+m; };
const hhmm = n => `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
const indiceGiorno = d => (d.getDay()+6) % 7;
const aData = d => d.toLocaleDateString("sv-SE");

const prodotti = () => new Map(dati.categorie.flatMap(c => c.prodotti.map(p => [p.id, p])));
const residuo = id => (residui[id] === undefined ? null : residui[id]);
const ordinabile = p => p.disponibile && (residuo(p.id) === null || residuo(p.id) > 0);
const spazio = id => { const r = residuo(id); return r === null ? Infinity : r - (ordine[id] || 0); };

/* ---------- carrello ---------- */

try { ordine = JSON.parse(localStorage.getItem("cs-vetrina-ordine")) || {}; } catch { ordine = {}; }
const salva = () => { try { localStorage.setItem("cs-vetrina-ordine", JSON.stringify(ordine)); } catch {} };

const pezzi = () => Object.values(ordine).reduce((a,b) => a+b, 0);
const totale = () => {
  const m = prodotti();
  return Object.entries(ordine).reduce((a,[id,q]) => a + (m.get(id)?.prezzo_finale ?? 0) * q, 0);
};

function cambia(id, delta) {
  const p = prodotti().get(id);
  if (!p || !ordinabile(p)) return;
  if (delta > 0 && spazio(id) <= 0) return mostraErrore(`Di ${p.nome} non ne restano altri.`);
  const q = (ordine[id] || 0) + delta;
  if (q <= 0) delete ordine[id]; else ordine[id] = q;
  salva();
  disegnaTutto();
}

/* ---------- caricamento ---------- */

async function carica() {
  try {
    const r = await fetch("api/menu", { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error();
    dati = await r.json();
    collegato = true;
  } catch {
    dati = DEMO;
    collegato = false;
  }

  dataResidui = dati.data || aData(new Date());
  residui = Object.fromEntries(dati.categorie.flatMap(c => c.prodotti.map(p => [p.id, p.residuo ?? null])));

  const m = prodotti();
  Object.keys(ordine).forEach(id => {
    const p = m.get(id);
    if (!p || !ordinabile(p)) { delete ordine[id]; return; }
    const r = residuo(id);
    if (r !== null && ordine[id] > r) ordine[id] = r;
  });
  salva();

  disegnaFiltri();
  disegnaGriglia();
  disegnaOrari();
  disegnaStato();
  disegnaTutto();
}

/* ---------- menù ---------- */

function disegnaFiltri() {
  const voci = [{ id:"tutti", nome:"Tutto" }, ...dati.categorie];
  $("#filtri").innerHTML = voci.map(v => `
    <button type="button" role="tab" data-filtro="${v.id}"
            aria-selected="${v.id === filtro}">${fuga(v.nome)}</button>`).join("");
}

function etichetta(p) {
  if (!ordinabile(p)) return ' <span class="segna segna-esaurito">esaurito</span>';
  const r = residuo(p.id);
  return r !== null && r <= 5 ? ` <span class="segna segna-scorta">ne restano ${r}</span>` : "";
}

function disegnaGriglia() {
  const elenco = dati.categorie
    .filter(c => filtro === "tutti" || c.id === filtro)
    .flatMap(c => c.prodotti);

  $("#griglia").innerHTML = elenco.map(p => `
    <article class="scheda${ordinabile(p) ? "" : " esaurita"}">
      <div class="scheda-foto">
        ${p.foto
          ? `<img src="${fuga(p.foto)}" alt="${fuga(p.nome)}" loading="lazy" decoding="async">`
          : `<span class="segno" aria-hidden="true"></span>`}
      </div>
      <h3>${fuga(p.nome)}${etichetta(p)}</h3>
      <p>${fuga(p.descrizione || "")}</p>
      <div class="scheda-piede">
        <span class="prezzo">${euro(p.prezzo_finale)}</span>
        <div data-comando="${p.id}"></div>
      </div>
    </article>`).join("");

  disegnaComandi();
}

function disegnaComandi() {
  const m = prodotti();
  document.querySelectorAll("[data-comando]").forEach(box => {
    const p = m.get(box.dataset.comando);
    if (!p || !ordinabile(p)) { box.innerHTML = ""; return; }
    const q = ordine[p.id] || 0;
    box.innerHTML = q === 0
      ? `<button class="aggiungi" type="button" data-piu="${p.id}" aria-label="Aggiungi ${fuga(p.nome)}">+</button>`
      : `<div class="contatore">
           <button type="button" data-meno="${p.id}" aria-label="Togli uno">−</button>
           <span aria-live="polite">${q}</span>
           <button type="button" data-piu="${p.id}" aria-label="Aggiungi uno"${spazio(p.id) <= 0 ? " disabled" : ""}>+</button>
         </div>`;
  });
}

/* ---------- orari ---------- */

function disegnaOrari() {
  $("#orari").innerHTML = dati.orari.map(o => `
    <li><span>${GIORNI[o.giorno]}</span><strong>${o.apertura ? `${o.apertura} – ${o.chiusura}` : "chiuso"}</strong></li>`).join("");
}

function disegnaStato() {
  const ora = new Date();
  const o = dati.orari.find(x => x.giorno === indiceGiorno(ora));
  const adesso = ora.getHours()*60 + ora.getMinutes();
  let aperto = false, testo;
  if (!o?.apertura) testo = "Oggi chiuso · ordini sempre aperti";
  else if (adesso < min(o.apertura)) testo = `Apriamo oggi alle ${o.apertura}`;
  else if (adesso >= min(o.chiusura)) testo = "Chiuso per oggi · ordini sempre aperti";
  else { aperto = true; testo = `Aperti ora fino alle ${o.chiusura}`; }
  $("#stato").dataset.chiuso = String(!aperto);
  $("#stato-testo").textContent = testo;
}

/* ---------- fasce di ritiro ---------- */

async function caricaFasce() {
  const sel = $("#orario");
  if (collegato) {
    try {
      const { fasce } = await (await fetch("api/fasce")).json();
      sel.innerHTML = fasce.length
        ? fasce.map(f => `<option value="${f.data}|${f.ora}">${fuga(f.etichetta)}${f.liberi <= 2 ? ` · ultimi ${f.liberi} posti` : ""}</option>`).join("")
        : `<option value="">Nessuna fascia libera, riprova più tardi</option>`;
      return;
    } catch { /* si ricade sul calcolo locale */ }
  }
  sel.innerHTML = fasceLocali().map(f => `<option value="${f.data}|${f.ora}">${fuga(f.etichetta)}</option>`).join("");
}

function fasceLocali() {
  const passo = Number(dati.impostazioni?.passo_fascia || 10);
  const anticipo = Number(dati.impostazioni?.anticipo_minimo || 15);
  const adesso = new Date();
  const out = [];
  for (let salto = 0; salto <= 3 && out.length === 0; salto++) {
    const g = new Date(adesso); g.setDate(g.getDate() + salto);
    const o = dati.orari.find(x => x.giorno === indiceGiorno(g));
    if (!o?.apertura) continue;
    let inizio = min(o.apertura);
    if (salto === 0) {
      const prima = adesso.getHours()*60 + adesso.getMinutes() + anticipo;
      inizio = Math.max(inizio, Math.ceil(prima/passo)*passo);
    }
    for (let t = inizio; t <= min(o.chiusura) - passo; t += passo) {
      out.push({ data: aData(g), ora: hhmm(t),
        etichetta: `${salto === 0 ? "oggi" : salto === 1 ? "domani" : GIORNI[indiceGiorno(g)].toLowerCase()} alle ${hhmm(t)}` });
    }
  }
  return out;
}

async function aggiornaResidui(data) {
  if (!collegato || !data || data === dataResidui) return;
  try {
    const r = await (await fetch(`api/disponibilita?data=${encodeURIComponent(data)}`)).json();
    residui = r.residui;
    dataResidui = r.data;
    let ridotto = false;
    Object.keys(ordine).forEach(id => {
      const res = residuo(id);
      if (res === null) return;
      if (res === 0) { delete ordine[id]; ridotto = true; }
      else if (ordine[id] > res) { ordine[id] = res; ridotto = true; }
    });
    if (ridotto) { salva(); mostraErrore("Per il giorno scelto le scorte sono minori: ho ridotto le quantità."); }
    disegnaGriglia();
    disegnaTutto();
  } catch { /* decide comunque il server all'invio */ }
}

/* ---------- riepilogo e invio ---------- */

function disegnaRiepilogo() {
  const m = prodotti();
  const voci = Object.entries(ordine);
  $("#campi").hidden = voci.length === 0;
  $("#invia").disabled = voci.length === 0;
  $("#righe").innerHTML = voci.length === 0
    ? `<p class="vuoto">L'ordine è vuoto. Scegli qualcosa dal menù.</p>`
    : voci.map(([id,q]) => {
        const p = m.get(id);
        return `<div class="riga">
          <div><strong>${fuga(p.nome)}</strong><span>${euro(p.prezzo_finale)} × ${q} = ${euro(p.prezzo_finale*q)}</span></div>
          <div class="contatore">
            <button type="button" data-meno="${id}" aria-label="Togli uno">−</button>
            <span>${q}</span>
            <button type="button" data-piu="${id}" aria-label="Aggiungi uno">+</button>
          </div>
        </div>`;
      }).join("");
  $("#totale").textContent = euro(totale());
}

function disegnaTutto() {
  if (!dati) return;
  disegnaComandi();
  disegnaRiepilogo();
  const n = pezzi();
  $("#conteggio").textContent = n;
  $("#totale-barra").textContent = euro(totale());
  $("#barra").hidden = n === 0;
}

function mostraErrore(testo) {
  const e = $("#errore");
  e.textContent = testo;
  e.hidden = !testo;
}

function messaggioWhatsapp(codice) {
  const m = prodotti();
  const righe = Object.entries(ordine).map(([id,q]) => `• ${q}× ${m.get(id).nome}`).join("\n");
  const sel = $("#orario");
  return [
    codice ? `Ciao, ho fatto l'ordine ${codice} dal sito:` : "Ciao Container Serraglio, vorrei ordinare:",
    "", righe, "",
    `Totale: ${euro(totale())}`,
    `Ritiro: ${sel.options[sel.selectedIndex]?.textContent || "da concordare"}`,
    $("#nome").value.trim() ? `Nome: ${$("#nome").value.trim()}` : ""
  ].filter(Boolean).join("\n");
}

async function invia() {
  if (pezzi() === 0) return;
  mostraErrore("");
  const nome = $("#nome").value.trim();
  if (nome.length < 2) return mostraErrore("Scrivi un nome per il ritiro.");
  const [data, ora] = ($("#orario").value || "").split("|");
  if (!data || !ora) return mostraErrore("Scegli una fascia di ritiro.");

  const numero = dati.impostazioni?.whatsapp || "393270536624";

  if (!collegato) {
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(messaggioWhatsapp(null))}`, "_blank", "noopener");
    return;
  }

  const bottone = $("#invia");
  bottone.disabled = true;
  bottone.textContent = "Invio…";
  try {
    const r = await fetch("api/ordini", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome, note: $("#note").value.trim(), ritiro_data: data, ritiro_ora: ora,
        righe: Object.entries(ordine).map(([id,quantita]) => ({ id, quantita }))
      })
    });
    const risposta = await r.json();
    if (!r.ok) throw new Error(risposta.errore || "Invio non riuscito.");

    $("#codice-ordine").textContent = risposta.codice;
    $("#conferma-testo").textContent = `${risposta.ritiro} · totale ${euro(risposta.totale)}. Di' il codice al banco quando ritiri.`;
    $("#avvisa-whatsapp").href = `https://wa.me/${numero}?text=${encodeURIComponent(messaggioWhatsapp(risposta.codice))}`;
    $("#corpo-ordine").hidden = true;
    $("#piede-ordine").hidden = true;
    $("#conferma").hidden = false;
    ordine = {}; salva(); disegnaTutto(); disegnaGriglia();
  } catch (e) {
    mostraErrore(e.message);
    await caricaFasce();
  } finally {
    bottone.disabled = false;
    bottone.textContent = "Invia l'ordine";
  }
}

/* ---------- eventi ---------- */

document.addEventListener("click", async e => {
  const f = e.target.closest("[data-filtro]");
  if (f) { filtro = f.dataset.filtro; disegnaFiltri(); disegnaGriglia(); return; }

  const piu = e.target.closest("[data-piu]");
  const meno = e.target.closest("[data-meno]");
  if (piu) cambia(piu.dataset.piu, 1);
  if (meno) cambia(meno.dataset.meno, -1);

  if (e.target.closest("#apri-ordine")) {
    $("#corpo-ordine").hidden = false;
    $("#piede-ordine").hidden = false;
    $("#conferma").hidden = true;
    mostraErrore("");
    await caricaFasce();
    await aggiornaResidui(($("#orario").value || "").split("|")[0]);
    $("#ordine").showModal();
  }
});

$("#orario").addEventListener("change", e => aggiornaResidui((e.target.value || "").split("|")[0]));
$("#chiudi-ordine").addEventListener("click", () => $("#ordine").close());
$("#nuovo-ordine").addEventListener("click", () => $("#ordine").close());
$("#invia").addEventListener("click", invia);

$("#apri-nav").addEventListener("click", e => {
  const nav = $("#nav-mobile");
  nav.hidden = !nav.hidden;
  e.currentTarget.setAttribute("aria-expanded", String(!nav.hidden));
});
$("#nav-mobile").addEventListener("click", e => {
  if (e.target.tagName === "A") {
    $("#nav-mobile").hidden = true;
    $("#apri-nav").setAttribute("aria-expanded", "false");
  }
});

carica();
setInterval(() => dati && disegnaStato(), 60_000);
