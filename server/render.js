/* Pagina principale composta dal server.
   Il telefono riceve già l'HTML completo, con il menù dentro: niente attesa
   di JavaScript per vedere cosa c'è da mangiare. Il risultato resta in
   memoria fino al cambio di data o alla prossima modifica dal pannello;
   solo il badge "aperto/chiuso" si ricalcola a ogni richiesta. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml as e, jsonPerHtml } from "../public/lib/escape.js";
import { etichetteAllergeni } from "../public/lib/allergeni.js";
import { oraRoma, aggiungiGiorni, statoApertura, testoStato } from "../public/lib/orari.js";
import { leggiMenu, leggiOrari, leggiChiusure, leggiImpostazioni } from "./db.js";
import { tipoImmagine, dimensioniImmagine } from "./foto.js";
import { footerLegale } from "./legale.js";

const qui = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(qui, "..", "public");
const MODELLO = path.join(qui, "modelli", "index.html");
const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const ILLUSTRAZIONI = { schiacciate: "schiacciata", pinsa: "pinsa", griglia: "burger", primi: "primo" };
const DATA_LUNGA = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

/* ---------- formattazione ---------- */

export const prezzoBreve = n =>
  `${Number(n).toLocaleString("it-IT", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const dataBreve = d => d.split("-").reverse().join("/");
const dataLunga = d => { const [a, m, g] = d.split("-").map(Number); return DATA_LUNGA.format(new Date(Date.UTC(a, m - 1, g))); };

/* ---------- foto ---------- */

const cartelle = { img: PUBLIC, foto: null };
const misure = new Map();
function dimensioniFoto(percorso) {
  if (!misure.has(percorso)) {
    let d = null;
    const [radice, ...resto] = percorso.split("/");
    const base = radice === "img" ? path.join(cartelle.img, "img") : radice === "foto" ? cartelle.foto : null;
    try {
      if (base && !resto.join("/").includes("..")) {
        const buf = fs.readFileSync(path.join(base, ...resto));
        d = dimensioniImmagine(buf, tipoImmagine(buf));
      }
    } catch { /* foto mancante: misure predefinite */ }
    misure.set(percorso, d || { larghezza: 640, altezza: 512 });
  }
  return misure.get(percorso);
}

function mediaHtml(p, c, caricamento = "lazy") {
  if (p.foto) {
    const { larghezza, altezza } = dimensioniFoto(p.foto);
    return `<img src="${e(p.foto)}" alt="" width="${larghezza}" height="${altezza}" loading="${caricamento}" decoding="async">`;
  }
  const disegno = p.id === "hd" ? "hotdog" : ILLUSTRAZIONI[c.id] || "piatto";
  return `<span class="scheda-ill"><svg aria-hidden="true" focusable="false"><use href="${e(asset("icons.svg"))}#ill-${disegno}"></use></svg></span>`;
}

/* ---------- versioni delle risorse ----------
   style.css?v=1a2b3c4d: il browser le tiene in cache un anno e il numero
   cambia da solo quando cambia il file. */
const versioni = new Map();
export function asset(file) {
  if (!versioni.has(file)) {
    try {
      const v = crypto.createHash("sha1").update(fs.readFileSync(path.join(cartelle.img, file))).digest("hex").slice(0, 8);
      versioni.set(file, `${file}?v=${v}`);
    } catch { versioni.set(file, file); }
  }
  return versioni.get(file);
}

/* ---------- pezzi della pagina ---------- */

export function schedaHtml(p, c, { caricamento = "lazy" } = {}) {
  const allergeni = etichetteAllergeni(p.allergeni.join(","));
  const righeAllergeni = [
    allergeni.length ? `Allergeni: ${allergeni.join(", ")}` : "",
    p.surgelati ? "* contiene surgelati" : ""
  ].filter(Boolean).join(" · ");
  const prezzoProprio = p.prezzo !== null && p.prezzo !== c.prezzo;
  return `<article class="scheda${p.finito ? " finito" : ""}" data-id="${e(p.id)}">
  <div class="scheda-media">${mediaHtml(p, c, caricamento)}</div>
  ${p.finito ? '<span class="etichetta-finito">Finito per oggi</span>' : ""}
  <h4 class="scheda-titolo">${e(p.nome)}</h4>
  ${p.descrizione ? `<p class="scheda-ingredienti">${e(p.descrizione)}</p>` : ""}
  ${righeAllergeni ? `<p class="scheda-allergeni">${e(righeAllergeni)}</p>` : ""}
  <div class="scheda-piede">${prezzoProprio ? `<span class="scheda-prezzo">${e(prezzoBreve(p.prezzo_finale))}</span>` : "<span></span>"}<button class="piu" type="button" aria-label="Aggiungi ${e(p.nome)}"${p.finito ? " disabled" : ""}>+</button></div>
  <button class="scheda-apri" type="button" aria-label="Dettagli di ${e(p.nome)}"></button>
</article>`;
}

function menuHtml(menu) {
  let primi = 2;   // le prime schede si caricano subito: sono quelle che si vedono
  return menu.filter(c => c.prodotti.length).map(c => `<section class="categoria" id="cat-${e(c.id)}" aria-labelledby="t-${e(c.id)}">
  <div class="cat-testa"><h3 id="t-${e(c.id)}">${e(c.nome)}</h3><span class="pillola-prezzo">${e(prezzoBreve(c.prezzo))}</span></div>
  ${c.nota ? `<p class="cat-nota">${e(c.nota)}</p>` : ""}
  <div class="griglia">
${c.prodotti.map(p => schedaHtml(p, c, { caricamento: primi-- > 0 ? "eager" : "lazy" })).join("\n")}
  </div>
</section>`).join("\n");
}

const chipsHtml = menu => `<nav class="chips" aria-label="Categorie del menù">${
  menu.filter(c => c.prodotti.length).map(c => `<a href="#cat-${e(c.id)}">${e(c.nome)}</a>`).join("")}</nav>`;

function statoHtml(orari, chiusure, now) {
  const s = statoApertura({ orari, chiusure, now });
  return `<p class="badge-stato${s.aperto ? " aperto" : ""}" id="stato"><span class="punto" aria-hidden="true"></span><span id="stato-testo">${e(testoStato(s))}</span></p>`;
}

function googleHtml(imp) {
  if (!imp.google_voto) return "";
  const voto = imp.google_voto.replace(".", ",");
  const testo = imp.google_recensioni ? `${voto} · ${imp.google_recensioni} recensioni su Google` : `${voto} su Google`;
  const interno = `<span class="stella" aria-hidden="true">★</span><span>${e(testo)}${
    imp.google_aggiornato ? `<small>aggiornato il ${e(dataBreve(imp.google_aggiornato))}</small>` : ""}</span>`;
  return imp.google_link
    ? `<a class="badge-google" href="${e(imp.google_link)}" target="_blank" rel="noopener">${interno}</a>`
    : `<span class="badge-google">${interno}</span>`;
}

function doveHtml(imp, orari, chiusure, oggi) {
  const giorno = oraRoma(oggi.now).giorno;
  const mappa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(imp.indirizzo || "")}`;
  const prossime = chiusure.filter(c => c.data <= aggiungiGiorni(oggi.data, 30));
  return `<div class="dove-griglia">
  <div>
    <p class="indirizzo">${e(imp.indirizzo)}</p>
    <p class="sezione-sotto">Nell'area del playground del Serraglio, a due minuti a piedi dal PIN e dalla stazione di Porta al Serraglio.</p>
    <div class="dove-azioni">
      <a class="bottone" href="${e(mappa)}" target="_blank" rel="noopener">Apri in Maps</a>
      ${imp.telefono ? `<a class="bottone bottone-chiaro" href="tel:${e(imp.telefono.replace(/[^\d+]/g, ""))}">Chiama ${e(imp.telefono)}</a>` : ""}
      ${imp.instagram ? `<a class="bottone bottone-chiaro" href="${e(imp.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ""}
    </div>
  </div>
  <div>
    <ul class="orari" aria-label="Orari della settimana">
${orari.map(o => `      <li${o.giorno === giorno ? ' class="oggi"' : ""}><span>${GIORNI[o.giorno]}</span><span>${o.apertura ? `${e(o.apertura)}–${e(o.chiusura)}` : "Chiuso"}</span></li>`).join("\n")}
    </ul>
    ${prossime.length ? `<ul class="chiusure">${prossime.map(c => `<li>Chiuso ${e(dataLunga(c.data))}${c.motivo ? ` · ${e(c.motivo)}` : ""}</li>`).join("")}</ul>` : ""}
  </div>
</div>`;
}

function jsonLd(imp, orari, baseUrl) {
  const indirizzo = (imp.indirizzo || "").match(/^(.*?),\s*(\d{5})\s+(.+)$/);
  const giorni = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dati = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: imp.nome_attivita,
    servesCuisine: ["Italiana", "Street food"],
    priceRange: "€",
    telephone: imp.telefono ? `+39 ${imp.telefono}` : undefined,
    address: indirizzo ? {
      "@type": "PostalAddress", streetAddress: indirizzo[1], postalCode: indirizzo[2],
      addressLocality: indirizzo[3], addressCountry: "IT"
    } : undefined,
    openingHoursSpecification: orari.filter(o => o.apertura).map(o => ({
      "@type": "OpeningHoursSpecification", dayOfWeek: giorni[o.giorno], opens: o.apertura, closes: o.chiusura
    })),
    url: baseUrl || undefined,
    hasMenu: baseUrl ? `${baseUrl}/#menu` : undefined,
    image: baseUrl ? `${baseUrl}/img/og.jpg` : undefined,
    sameAs: [imp.instagram, imp.facebook].filter(Boolean),
    aggregateRating: imp.google_voto && imp.google_recensioni ? {
      "@type": "AggregateRating", ratingValue: imp.google_voto, reviewCount: imp.google_recensioni, bestRating: "5"
    } : undefined
  };
  return `<script type="application/ld+json">${jsonPerHtml(dati)}</script>`;
}

function headMeta(imp, baseUrl) {
  const titolo = `${imp.nome_attivita} — pranzo da asporto davanti al PIN di Prato`;
  const descrizione = "Schiacciate, pinse, hamburgher e primi preparati nel container davanti al PIN. Scegli dal menù, invia l'ordine su WhatsApp e passa a ritirarlo. Bevuta e caffè compresi.";
  const immagine = baseUrl ? `${baseUrl}/img/og.jpg` : "img/og.jpg";
  return [
    `<title>${e(titolo)}</title>`,
    `<meta name="description" content="${e(descrizione)}">`,
    imp.modalita_demo === "1" ? '<meta name="robots" content="noindex">' : "",
    baseUrl ? `<link rel="canonical" href="${e(baseUrl)}/">` : "",
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="it_IT">`,
    `<meta property="og:title" content="${e(titolo)}">`,
    `<meta property="og:description" content="${e(descrizione)}">`,
    `<meta property="og:image" content="${e(immagine)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`
  ].filter(Boolean).join("\n");
}

function datiBrowser(menu, orari, chiusure, imp, oggi) {
  const prodotti = {};
  for (const c of menu) for (const p of c.prodotti) {
    prodotti[p.id] = {
      nome: p.nome, categoria: c.nome, descrizione: p.descrizione, prezzo_finale: p.prezzo_finale, finito: p.finito,
      foto: p.foto, allergeni: etichetteAllergeni(p.allergeni.join(",")), surgelati: p.surgelati
    };
  }
  return `<script type="application/json" id="dati">${jsonPerHtml({
    oggi, orari, chiusure: chiusure.map(c => c.data), impostazioni: imp, prodotti
  })}</script>`;
}

/* ---------- composizione ---------- */

export function creaRender({ db, now = () => new Date(), cartellaPublic = PUBLIC, cartellaFoto = null, baseUrl = "" }) {
  cartelle.img = cartellaPublic;
  cartelle.foto = cartellaFoto;
  let cache = null;

  function componi(adesso) {
    const oggi = oraRoma(adesso).data;
    const imp = leggiImpostazioni(db);
    const menu = leggiMenu(db, { oggi });
    const orari = leggiOrari(db);
    const chiusure = leggiChiusure(db, oggi);
    const slot = {
      "head-meta": headMeta(imp, baseUrl),
      jsonld: jsonLd(imp, orari, baseUrl),
      demo: imp.modalita_demo === "1"
        ? '<p class="nastro-demo" role="note">Demo — sito non ufficiale, non gestito dal locale</p>' : "",
      google: googleHtml(imp),
      chips: chipsHtml(menu),
      menu: menuHtml(menu),
      dove: doveHtml(imp, orari, chiusure, { data: oggi, now: adesso }),
      legale: footerLegale(imp),
      dati: datiBrowser(menu, orari, chiusure, imp, oggi)
    };
    const html = fs.readFileSync(MODELLO, "utf8")
      .replace(/\{\{asset:([^}]+)\}\}/g, (_, f) => e(asset(f)))
      .replace(/<!--slot:([a-z-]+)-->/g, (tutto, nome) => (nome in slot ? slot[nome] : tutto));
    return { oggi, html, orari, chiusure: chiusure.map(c => c.data) };
  }

  return {
    pagina() {
      const adesso = now();
      if (!cache || cache.oggi !== oraRoma(adesso).data) cache = componi(adesso);
      return cache.html.replace("<!--slot:stato-->", statoHtml(cache.orari, cache.chiusure, adesso));
    },
    invalida() { cache = null; }
  };
}
