/* Pagine legali e informative, composte dai dati del pannello.
   I testi si aggiornano da soli quando il titolare cambia ragione sociale,
   PEC o allergeni: non c'è un documento da tenere allineato a mano.
   Dove manca un dato si vede "dato da completare", mai un valore inventato.
   Testi scritti seguendo GDPR, linee guida cookie del Garante (10/6/2021),
   Reg. UE 1169/2011 e Codice del consumo; da far rivedere al
   commercialista o consulente del locale prima della messa online. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml as e } from "../public/lib/escape.js";
import { ALLERGENI } from "../public/lib/allergeni.js";

const qui = path.dirname(fileURLToPath(import.meta.url));
const MODELLO = path.join(qui, "modelli", "pagina.html");
const CREDITI = path.join(qui, "..", "public", "img", "crediti.json");
const MANCA = '<span class="da-completare">dato da completare</span>';
const v = valore => (valore ? e(valore) : MANCA);

/* ---------- piede, uguale su tutte le pagine ----------
   Obbligatori per chi ha partita IVA (DPR 633/72 art. 35) e per i servizi
   online (D.Lgs 70/2003 art. 7). */
export function footerLegale(imp) {
  return `<p class="legale">${v(imp.ragione_sociale)}<br>${e(imp.indirizzo)}<br>P.IVA ${v(imp.piva)} · C.F. ${v(imp.codice_fiscale)}${
    imp.rea ? ` · REA ${e(imp.rea)}` : ""}<br>PEC ${v(imp.pec)}${imp.telefono ? ` · Tel. ${e(imp.telefono)}` : ""}</p>`;
}

/* ---------- contenuti ---------- */

function privacy({ impostazioni: imp }) {
  const titolare = imp.titolare_trattamento || imp.ragione_sociale;
  return `<h1>Privacy e cookie</h1>
<p>Questa pagina spiega quali dati passano da questo sito e perché. In breve: il sito non chiede account, non usa cookie pubblicitari o di statistica e non registra gli ordini.</p>

<h2>Chi è il titolare</h2>
<p>Il titolare del trattamento è ${v(titolare)}, ${e(imp.indirizzo)}. Per qualsiasi richiesta sui tuoi dati: ${v(imp.pec || imp.email)}${imp.telefono ? `, telefono ${e(imp.telefono)}` : ""}.</p>

<h2>Cosa resta sul sito</h2>
<p>Niente che ti riguardi. Il sito mostra il menù e prepara il messaggio d'ordine: non lo riceve e non lo conserva. Non ci sono registrazioni, profili o newsletter.</p>

<h2>Vassoio e cookie tecnici</h2>
<ul>
<li>Il <strong>vassoio</strong> e il nome per il ritiro restano nella memoria del tuo browser (localStorage), sul tuo telefono, così non li perdi se chiudi la pagina. Non vengono inviati a noi. Puoi cancellarli svuotando il vassoio o i dati del sito dal browser.</li>
<li>Il <strong>pannello del locale</strong> usa un cookie tecnico di sessione, solo per chi gestisce il sito.</li>
</ul>
<p>Sono strumenti strettamente necessari al funzionamento: secondo le linee guida del Garante per la protezione dei dati personali (10 giugno 2021) non richiedono consenso, per questo il sito non mostra un banner dei cookie.</p>

<h2>Registri del server</h2>
<p>Come ogni sito, il server registra le richieste ricevute (pagina, ora, tipo di browser) per sicurezza e per risolvere guasti. L'indirizzo IP viene accorciato in modo da non identificare il singolo dispositivo e i registri si cancellano da soli dopo 7 giorni.</p>

<h2>Ordini su WhatsApp</h2>
<p>Quando tocchi «Invia su WhatsApp», il sito apre WhatsApp con un messaggio già scritto: il tuo nome per il ritiro, l'ora, i prodotti e le eventuali note. Il messaggio parte solo se lo invii tu, e viaggia tramite WhatsApp, un servizio di Meta Platforms Ireland Ltd., che lo tratta secondo la propria informativa (<a href="https://www.whatsapp.com/legal/privacy-policy-eea" target="_blank" rel="noopener">privacy di WhatsApp</a>).</p>
<p>Il locale usa il messaggio solo per preparare e consegnarti l'ordine, sulla base della tua richiesta (art. 6.1.b GDPR), e cancella le chat degli ordini entro 30 giorni. Se nelle note scrivi un'allergia, la usiamo soltanto per prepararti il cibo in sicurezza: scrivi solo quello che serve.</p>

<h2>Nessun servizio di terzi</h2>
<p>Font, immagini e codice sono serviti da questo sito: nessun servizio di terzi viene caricato mentre navighi, quindi nessun dato viene inviato a Google, Meta o altri fornitori. Il pulsante «Apri in Maps» e i link ai social ti portano su quei siti solo se li tocchi.</p>

<h2>I tuoi diritti</h2>
<p>Puoi chiedere di accedere ai tuoi dati, correggerli, cancellarli, limitarne l'uso od opporti, scrivendo ai contatti qui sopra. Se ritieni che i tuoi dati siano trattati in modo non corretto puoi rivolgerti al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">garanteprivacy.it</a>).</p>`;
}

function allergeni({ impostazioni: imp, menu }) {
  const righe = menu.flatMap(c => c.prodotti).map(p => `<tr><th scope="row">${e(p.nome)}</th>${
    ALLERGENI.map(a => p.allergeni.includes(a.codice) ? `<td><span aria-hidden="true">✓</span><span class="solo-lettori">${e(a.etichetta)}</span></td>` : "<td></td>").join("")}</tr>`).join("\n");
  return `<h1>Allergeni</h1>
${imp.allergeni_verificati === "1" ? "" : '<p class="avviso">Le informazioni sugli allergeni sono in corso di verifica con la cucina. Prima di ordinare chiedi sempre al banco.</p>'}
<p>Per ogni prodotto sono indicati i 14 allergeni previsti dal Regolamento UE 1169/2011. L'asterisco (*) sul menù indica ingredienti surgelati.</p>
<p>In cucina usiamo gli stessi piani e le stesse attrezzature per tutti i prodotti: anche dove non è segnato, possono esserci <strong>tracce</strong> di altri allergeni. Se hai un'allergia o un'intolleranza scrivilo nelle note dell'ordine o chiedi al banco prima di ordinare.</p>
<div class="tabella-scorre">
<table class="tabella-allergeni">
<caption class="solo-lettori">Allergeni per prodotto</caption>
<thead><tr><th scope="col">Prodotto</th>${ALLERGENI.map(a => `<th scope="col">${e(a.etichetta)}</th>`).join("")}</tr></thead>
<tbody>
${righe}
</tbody>
</table>
</div>`;
}

function ordiniCome({ impostazioni: imp }) {
  return `<h1>Come funzionano gli ordini</h1>
<h2>1. Scegli e invia</h2>
<p>Componi il vassoio, scegli l'ora di ritiro e tocca «Invia su WhatsApp»: si apre WhatsApp con il messaggio già pronto verso il numero del locale${imp.telefono ? ` (${e(imp.telefono)})` : ""}. Il sito non registra l'ordine: conta solo il messaggio che invii.</p>
<h2>2. Conferma</h2>
<p>L'ordine è accettato quando il locale ti risponde su WhatsApp. Se un prodotto è finito o l'orario non va bene, te lo diciamo lì.</p>
<h2>3. Ritiro e pagamento</h2>
<p>Passi al banco all'ora scelta e paghi al ritiro. I prezzi sono in euro, IVA inclusa, e comprendono bevuta e caffè dove indicato.</p>
<h2>Annullare o cambiare</h2>
<p>Scrivi nella stessa chat il prima possibile. Trattandosi di cibo preparato al momento e di prodotti deperibili, non si applica il diritto di recesso (Codice del consumo, D.Lgs 206/2005, art. 59, comma 1, lett. d): se l'ordine è già pronto, va ritirato.</p>
<h2>Allergie</h2>
<p>Gli allergeni di ogni prodotto sono nella scheda del prodotto e nella <a href="allergeni">pagina degli allergeni</a>. Per allergie e intolleranze scrivilo nelle note o chiedi al banco.</p>`;
}

function crediti({ menu }) {
  let voci = [];
  try { voci = JSON.parse(fs.readFileSync(CREDITI, "utf8")); } catch { /* nessun credito */ }
  const usate = new Set(menu.flatMap(c => c.prodotti).map(p => p.foto));
  voci = voci.filter(c => usate.has(`img/${c.file}`));
  return `<h1>Crediti delle foto</h1>
<p>Alcune foto del menù sono indicative e provengono da Wikimedia Commons, con licenze Creative Commons che chiedono di citare l'autore. Il prodotto che ritiri può essere diverso.</p>
${voci.length ? `<ul>${voci.map(c => `<li><strong>${e(c.prodotto)}</strong>: «${e(c.titolo)}» di ${e(c.autore)}, <a href="${e(c.url_licenza)}" rel="license noopener" target="_blank">${e(c.licenza)}</a>. ${e(c.modifiche)}. <a href="${e(c.url_originale)}" target="_blank" rel="noopener">Originale su Wikimedia Commons</a>.</li>`).join("\n")}</ul>`
    : "<p>Tutte le foto del menù sono del locale.</p>"}`;
}

const PAGINE = {
  privacy: ["Privacy e cookie", privacy],
  allergeni: ["Allergeni", allergeni],
  "ordini-come": ["Come funzionano gli ordini", ordiniCome],
  crediti: ["Crediti delle foto", crediti]
};
export const NOMI_PAGINE = Object.keys(PAGINE);

export function paginaLegale(nome, contesto, { asset = f => f } = {}) {
  const [titolo, contenuto] = PAGINE[nome];
  const imp = contesto.impostazioni;
  const slot = {
    "head-meta": `<title>${e(titolo)} — ${e(imp.nome_attivita)}</title>${imp.modalita_demo === "1" ? '\n<meta name="robots" content="noindex">' : ""}`,
    demo: imp.modalita_demo === "1" ? '<p class="nastro-demo" role="note">Demo — sito non ufficiale, non gestito dal locale</p>' : "",
    contenuto: contenuto(contesto),
    legale: footerLegale(imp)
  };
  return fs.readFileSync(MODELLO, "utf8")
    .replace(/\{\{asset:([^}]+)\}\}/g, (_, f) => e(asset(f)))
    .replace(/<!--slot:([a-z-]+)-->/g, (tutto, n) => (n in slot ? slot[n] : tutto));
}

/* ---------- motori di ricerca ---------- */

export function robotsTxt(demo, base = "") {
  if (demo) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nDisallow: /admin\nDisallow: /api/\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ""}`;
}

export function sitemapXml(base) {
  const indirizzi = ["/", ...NOMI_PAGINE.map(n => `/${n}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indirizzi.map(u => `  <url><loc>${e(base + u)}</loc></url>`).join("\n")}
</urlset>
`;
}
