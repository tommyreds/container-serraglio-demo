/* Schermata Menù: prodotti e categorie.
   Si tocca una riga per modificarla; le frecce spostano su e giù (niente
   trascinamento, che col pollice si sbaglia). Le eliminazioni chiedono
   sempre conferma con il nome di quello che sparisce. */

import { api } from "./api.js";
import { $, $$, e, salva, mostraEsito, conferma, campo, interruttore, euroBreve } from "./ui.js";
import { preparaFoto } from "./foto.js";
import { etichetteAllergeni } from "../lib/allergeni.js";

const ILLUSTRAZIONI = { schiacciate: "schiacciata", pinsa: "pinsa", griglia: "burger", primi: "primo" };
const disegno = (p, c) => (p.id === "hd" ? "hotdog" : ILLUSTRAZIONI[c.id] || "piatto");
const svg = (p, c) => `<svg aria-hidden="true" focusable="false"><use href="icons.svg#ill-${disegno(p, c)}"></use></svg>`;

export function disegnaMenu(el, dati, ricarica) {
  el.innerHTML = `${dati.categorie.map(c => `
    <section class="blocco" aria-labelledby="cat-${e(c.id)}">
      <div class="cat-riga">
        <h2 id="cat-${e(c.id)}">${e(c.nome)} · ${e(euroBreve(c.prezzo))}</h2>
        <button type="button" class="grosso secondario" data-categoria="${e(c.id)}">Modifica</button>
      </div>
      ${c.prodotti.length ? `<ul class="lista-prodotti">${c.prodotti.map((p, i) => `
        <li>
          <button type="button" class="riga-prodotto" data-prodotto="${e(p.id)}">
            <span class="miniatura">${p.foto ? `<img src="${e(p.foto)}" alt="" loading="lazy">` : svg(p, c)}</span>
            <span class="nome">${e(p.nome)}${p.disponibile ? "" : '<span class="segno">nascosto</span>'}${p.finito ? '<span class="segno">finito oggi</span>' : ""}
              <small>${e(euroBreve(p.prezzo_finale))}${p.descrizione ? ` · ${e(p.descrizione)}` : ""}</small></span>
          </button>
          <span class="sposta">
            <button type="button" data-su="${e(p.id)}" aria-label="Sposta su ${e(p.nome)}"${i === 0 ? " disabled" : ""}>↑</button>
            <button type="button" data-giu="${e(p.id)}" aria-label="Sposta giù ${e(p.nome)}"${i === c.prodotti.length - 1 ? " disabled" : ""}>↓</button>
          </span>
        </li>`).join("")}</ul>` : '<p class="guida">Nessun prodotto in questa categoria.</p>'}
      <button type="button" class="grosso secondario" data-nuovo="${e(c.id)}">Aggiungi prodotto</button>
    </section>`).join("")}
    <button type="button" class="grosso" id="nuova-categoria">Aggiungi una categoria</button>`;

  const trova = id => {
    for (const c of dati.categorie) { const p = c.prodotti.find(x => x.id === id); if (p) return { p, c }; }
    return {};
  };

  el.onclick = async ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.prodotto) { const { p, c } = trova(b.dataset.prodotto); apriProdotto(p, c, dati, ricarica); }
    if (b.dataset.nuovo) apriProdotto(null, dati.categorie.find(c => c.id === b.dataset.nuovo), dati, ricarica);
    if (b.dataset.categoria) apriCategoria(dati.categorie.find(c => c.id === b.dataset.categoria), ricarica);
    if (b.id === "nuova-categoria") apriCategoria(null, ricarica);
    const sposta = b.dataset.su || b.dataset.giu;
    if (sposta) {
      const direzione = b.dataset.su ? "su" : "giu";
      if (await salva(() => api("POST", `/prodotti/${encodeURIComponent(sposta)}/sposta`, { direzione }), "Ordine salvato")) {
        await ricarica();
        $(`[data-${direzione}="${CSS.escape(sposta)}"]`)?.focus();
      }
    }
  };
}

/* ---------- editor ---------- */

const editor = () => $("#editor");
const modulo = () => $("#modulo-editor");

function erroreEditor(testo) {
  const p = $("#errore-editor");
  p.textContent = testo;
  p.hidden = !testo;
}

function anteprima(p, c, valori) {
  const allergeni = etichetteAllergeni(valori.allergeni.join(","));
  const righe = [allergeni.length ? `Allergeni: ${allergeni.join(", ")}` : "", valori.surgelati ? "* contiene surgelati" : ""].filter(Boolean).join(" · ");
  return `<article class="scheda">
    <div class="scheda-media">${valori.foto ? `<img src="${e(valori.foto)}" alt="">` : `<span class="scheda-ill">${svg(p || { id: "" }, c)}</span>`}</div>
    <h4 class="scheda-titolo">${e(valori.nome || "Nome del prodotto")}</h4>
    ${valori.descrizione ? `<p class="scheda-ingredienti">${e(valori.descrizione)}</p>` : ""}
    ${righe ? `<p class="scheda-allergeni">${e(righe)}</p>` : ""}
    <div class="scheda-piede"><span></span><span class="piu" aria-hidden="true">+</span></div>
  </article>`;
}

function leggiModulo(f) {
  return {
    nome: f.nome.value, descrizione: f.descrizione.value, prezzo: f.prezzo.value.trim(),
    allergeni: $$('input[name="allergene"]:checked', f).map(x => x.value),
    surgelati: f.surgelati.checked, disponibile: $("#mostra-prodotto", f).checked
  };
}

function apriProdotto(p, c, dati, ricarica) {
  const nuovo = !p;
  $("#titolo-editor").textContent = nuovo ? `Nuovo prodotto · ${c.nome}` : p.nome;
  let foto = p?.foto || null;
  const f = modulo();
  f.innerHTML = `
    ${nuovo ? "" : `<div class="anteprima" id="anteprima" aria-hidden="true"></div>
    <div class="foto-azioni">
      <label class="carica-foto"><span class="grosso secondario" aria-hidden="true">${foto ? "Cambia foto" : "Scatta o scegli una foto"}</span>
        <input type="file" id="file-foto" accept="image/*" capture="environment" aria-label="Scatta o scegli una foto"></label>
      ${foto ? '<button type="button" class="grosso secondario" id="togli-foto">Rimuovi la foto</button>' : ""}
      <p class="aiuto" id="stato-foto" role="status"></p>
    </div>`}
    ${campo({ id: "nome", etichetta: "Nome", valore: p?.nome || "", attributi: 'maxlength="60" required' })}
    ${campo({ id: "descrizione", etichetta: "Ingredienti", valore: p?.descrizione || "", tipo: "textarea", attributi: 'maxlength="200"',
      aiuto: "Separati da virgole, come sul cartellone." })}
    ${campo({ id: "prezzo", etichetta: "Prezzo (facoltativo)", valore: p?.prezzo === null || p?.prezzo === undefined ? "" : String(p.prezzo).replace(".", ","),
      attributi: `inputmode="decimal" placeholder="${e(euroBreve(c.prezzo))}, come la categoria"`,
      aiuto: "Lascia vuoto per usare il prezzo della categoria." })}
    <fieldset class="allergeni-scelta">
      <legend>Allergeni</legend>
      <div class="griglia-spunte">${dati.allergeni.map(a => `
        <label class="spunta"><input type="checkbox" name="allergene" value="${e(a.codice)}"${p?.allergeni.includes(a.codice) ? " checked" : ""}> ${e(a.etichetta)}</label>`).join("")}
      </div>
    </fieldset>
    <label class="spunta"><input type="checkbox" name="surgelati"${p?.surgelati ? " checked" : ""}> Contiene ingredienti surgelati</label>
    ${interruttore({ id: "mostra-prodotto", etichetta: "Mostra nel menù", acceso: p ? p.disponibile : true,
      aiuto: "Spento: il prodotto resta qui ma non compare sul sito." })}
    <p class="errore-editor" id="errore-editor" role="alert" hidden></p>
    <div class="azioni-editor">
      <button type="submit" class="grosso">${nuovo ? "Aggiungi al menù" : "Salva"}</button>
      ${nuovo ? "" : '<button type="button" class="grosso pericolo" id="elimina-prodotto">Elimina il prodotto</button>'}
    </div>`;

  const aggiornaAnteprima = () => {
    const box = $("#anteprima", f);
    if (box) box.innerHTML = anteprima(p, c, { ...leggiModulo(f), foto });
  };
  aggiornaAnteprima();
  f.oninput = aggiornaAnteprima;

  f.onsubmit = async ev => {
    ev.preventDefault();
    erroreEditor("");
    const v = leggiModulo(f);
    try {
      if (nuovo) await api("POST", "/prodotti", { ...v, categoria_id: c.id });
      else await api("PATCH", `/prodotti/${encodeURIComponent(p.id)}`, v);
      editor().close();
      mostraEsito(nuovo ? "Prodotto aggiunto" : "Salvato");
      await ricarica();
    } catch (err) { erroreEditor(err.message); }
  };

  $("#elimina-prodotto", f)?.addEventListener("click", async () => {
    editor().close();
    if (!(await conferma(`Eliminare ${p.nome}? Non si può annullare.`, { si: "Elimina" }))) { editor().showModal(); return; }
    if (await salva(() => api("DELETE", `/prodotti/${encodeURIComponent(p.id)}`), `${p.nome} eliminato`)) await ricarica();
  });

  $("#file-foto", f)?.addEventListener("change", async ev => {
    const file = ev.target.files[0];
    if (!file) return;
    const stato = $("#stato-foto", f);
    stato.textContent = "Preparo la foto…";
    try {
      const pronta = await preparaFoto(file);
      stato.textContent = "Carico la foto…";
      const r = await api("PUT", `/prodotti/${encodeURIComponent(p.id)}/foto`, undefined, { grezzo: pronta, tipo: pronta.type });
      foto = r.foto;
      p.foto = r.foto;
      stato.textContent = "Foto salvata: si vede già sul sito.";
      aggiornaAnteprima();
      ricarica();
    } catch (err) {
      stato.textContent = "";
      erroreEditor(err.message || "Non riesco a leggere questa foto, provane un'altra.");
    } finally {
      ev.target.value = "";
    }
  });

  $("#togli-foto", f)?.addEventListener("click", async () => {
    try {
      await api("DELETE", `/prodotti/${encodeURIComponent(p.id)}/foto`);
      foto = null;
      p.foto = null;
      $("#stato-foto", f).textContent = "Foto rimossa: sul sito torna il disegno.";
      $("#togli-foto", f).remove();
      aggiornaAnteprima();
      ricarica();
    } catch (err) { erroreEditor(err.message); }
  });

  editor().showModal();
  if (nuovo) $("#nome", f).focus();
}

function apriCategoria(c, ricarica) {
  const nuova = !c;
  $("#titolo-editor").textContent = nuova ? "Nuova categoria" : `Categoria · ${c.nome}`;
  const f = modulo();
  f.innerHTML = `
    ${campo({ id: "nome", etichetta: "Nome", valore: c?.nome || "", attributi: 'maxlength="60" required' })}
    ${campo({ id: "prezzo", etichetta: "Prezzo di tutta la categoria", valore: c ? String(c.prezzo).replace(".", ",") : "",
      attributi: 'inputmode="decimal" placeholder="Es. 6 o 6,50"' })}
    ${campo({ id: "nota", etichetta: "Nota sotto il titolo (facoltativa)", valore: c?.nota || "", attributi: 'maxlength="200"',
      aiuto: "Es. «Bevuta e caffè compresi»." })}
    <p class="errore-editor" id="errore-editor" role="alert" hidden></p>
    <div class="azioni-editor">
      <button type="submit" class="grosso">${nuova ? "Aggiungi la categoria" : "Salva"}</button>
      ${nuova ? "" : '<button type="button" class="grosso pericolo" id="elimina-categoria">Elimina la categoria</button>'}
    </div>`;
  f.oninput = null;
  f.onsubmit = async ev => {
    ev.preventDefault();
    erroreEditor("");
    const v = { nome: f.nome.value, prezzo: f.prezzo.value, nota: f.nota.value };
    try {
      if (nuova) await api("POST", "/categorie", v);
      else await api("PATCH", `/categorie/${encodeURIComponent(c.id)}`, v);
      editor().close();
      mostraEsito(nuova ? "Categoria aggiunta" : "Salvato");
      await ricarica();
    } catch (err) { erroreEditor(err.message); }
  };
  $("#elimina-categoria", f)?.addEventListener("click", async () => {
    editor().close();
    if (!(await conferma(`Eliminare la categoria ${c.nome}?`, { si: "Elimina" }))) { editor().showModal(); return; }
    if (await salva(() => api("DELETE", `/categorie/${encodeURIComponent(c.id)}`), "Categoria eliminata")) await ricarica();
  });
  editor().showModal();
  $("#nome", f).focus();
}

/* chiusura dell'editor con la X o toccando fuori */
document.addEventListener("click", ev => {
  const d = editor();
  if (d?.open && (ev.target === d || ev.target.closest("#editor [data-chiudi]"))) d.close();
});
