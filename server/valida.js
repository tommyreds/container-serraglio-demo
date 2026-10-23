/* Controllo dei dati che arrivano dal pannello.
   Ogni funzione restituisce il valore pulito o lancia ErroreValidazione con
   una frase che il titolare capisce senza aiuto: le rotte la mostrano così
   com'è. Il pannello prova a essere tollerante ("6,50 €" va bene) ma il
   server non si fida mai di quello che riceve. */

export class ErroreValidazione extends Error {}

const errore = messaggio => { throw new ErroreValidazione(messaggio); };
const lunghezza = s => [...s].length;

export function leggiPrezzo(v) {
  const testo = typeof v === "number" ? String(v) : typeof v === "string" ? v.replace(/€/g, "").trim().replace(",", ".") : "";
  const n = /^\d+(\.\d+)?$/.test(testo) ? Number(testo) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 500) errore("Il prezzo deve essere un numero, es. 6 o 6,50.");
  return Math.round(n * 100) / 100;
}

export function leggiTesto(v, { min = 0, max, campo }) {
  if (typeof v !== "string" && typeof v !== "number") errore(`${campo}: da ${min} a ${max} caratteri.`);
  const s = String(v).trim();
  if (lunghezza(s) < min || lunghezza(s) > max) errore(`${campo}: da ${min} a ${max} caratteri.`);
  return s;
}

export function leggiData(v) {
  const s = String(v ?? "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.toISOString().slice(0, 10) !== s) errore("Data non valida.");
  return s;
}

export function leggiOra(v) {
  const s = String(v ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) errore("Orario non valido: usa il formato 12:30.");
  return s;
}

export function normalizzaWhatsapp(v) {
  const s = String(v ?? "").replace(/[\s+\-()]/g, "");
  if (!/^\d{8,15}$/.test(s)) errore("Numero WhatsApp non valido: scrivilo con il prefisso, es. 39 327 053 6624.");
  return s;
}

const DOMINI_PERMESSI = new Set(["instagram.com", "facebook.com", "google.com", "g.page", "maps.app.goo.gl"]);

export function leggiLink(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  let url;
  try { url = new URL(s); } catch { errore("Link non valido: incollalo intero, con https://"); }
  const host = url.hostname.replace(/^www\./, "");
  if (url.protocol !== "https:" || url.username || url.password || !DOMINI_PERMESSI.has(host)) {
    errore("Sono accettati solo link https di Instagram, Facebook o Google Maps.");
  }
  return url.href;
}

/* ---------- impostazioni ---------- */

const testo = (min, max, campo) => v => leggiTesto(v ?? "", { min, max, campo });
const interruttore = v => (v === "0" || v === "1" || v === 0 || v === 1 || typeof v === "boolean")
  ? String(Number(v)) : errore("Valore non valido.");
const intero = (min, max, messaggio) => v => {
  const s = String(v ?? "").trim();
  if (!/^\d+$/.test(s) || +s < min || +s > max) errore(messaggio);
  return String(+s);
};
const facoltativo = controllo => v => (String(v ?? "").trim() === "" ? "" : controllo(String(v).trim()));
const email = campo => facoltativo(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120 ? s : errore(`${campo}: indirizzo non valido.`));

export const VALIDATORI_IMPOSTAZIONI = {
  nome_attivita: testo(2, 60, "Nome del locale"),
  telefono: testo(0, 30, "Telefono"),
  whatsapp: normalizzaWhatsapp,
  indirizzo: testo(0, 120, "Indirizzo"),
  email: email("Email"),
  instagram: leggiLink,
  facebook: leggiLink,
  google_link: leggiLink,
  google_voto: facoltativo(s => {
    const n = Number(s.replace(",", "."));
    if (!/^\d(?:[.,]\d)?$/.test(s) || n < 1 || n > 5) errore("Il voto Google va da 1 a 5, es. 4,7.");
    return n.toFixed(1);
  }),
  google_recensioni: facoltativo(intero(0, 100_000, "Numero di recensioni non valido.")),
  ragione_sociale: testo(0, 120, "Ragione sociale"),
  piva: facoltativo(s => /^\d{11}$/.test(s) ? s : errore("La partita IVA ha 11 cifre.")),
  codice_fiscale: facoltativo(s => /^(\d{11}|[A-Za-z0-9]{16})$/.test(s) ? s.toUpperCase() : errore("Codice fiscale non valido.")),
  rea: testo(0, 30, "Numero REA"),
  pec: email("PEC"),
  titolare_trattamento: testo(0, 200, "Titolare del trattamento"),
  nota_prezzi: testo(0, 200, "Nota sui prezzi"),
  anticipo_minimo: intero(0, 120, "L'anticipo va da 0 a 120 minuti."),
  passo_fascia: v => ["5", "10", "15", "20", "30"].includes(String(v)) ? String(v) : errore("Intervallo non valido: scegli 5, 10, 15, 20 o 30 minuti."),
  ordini_attivi: interruttore,
  allergeni_verificati: interruttore,
  modalita_demo: interruttore
};
