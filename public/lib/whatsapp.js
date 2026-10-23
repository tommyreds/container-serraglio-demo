/* Messaggio d'ordine per WhatsApp.
   Il sito non riceve gli ordini: prepara il testo e apre WhatsApp verso il
   numero del locale. Qui c'è solo la composizione, pura, così il browser e
   i test usano esattamente la stessa. */

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const FORMATTAZIONE = new Set(["*", "_", "~", "`"]);

export const euro = n => EURO.format(n);

/* Toglie caratteri di controllo e quelli che WhatsApp usa per grassetto,
   corsivo e simili, riduce gli a capo a spazi e taglia a "max" caratteri
   (contati per carattere vero, così un'emoji non viene spezzata a metà). */
export function pulisci(testo, max) {
  const caratteri = [...String(testo ?? "")].map(ch => {
    const c = ch.codePointAt(0);
    if (c < 32 || (c >= 127 && c < 160)) return " ";
    return FORMATTAZIONE.has(ch) ? "" : ch;
  });
  return [...caratteri.join("").replace(/\s+/g, " ").trim()].slice(0, max).join("");
}

export function componiMessaggio({ nome, ora, righe, note, demo }) {
  const totale = righe.reduce((a, r) => a + r.prezzo * r.quantita, 0);
  const pulite = pulisci(note, 200);
  return [
    `${demo ? "[DEMO] " : ""}Ciao! Ordine per il ritiro alle ${ora}`,
    `Nome: ${pulisci(nome, 40)}`,
    ...righe.map(r => `• ${r.quantita}× ${r.nome} — ${euro(r.prezzo * r.quantita)}`),
    `Totale: ${euro(totale)} (pago al ritiro)`,
    ...(pulite ? [`Note: ${pulite}`] : [])
  ].join("\n");
}

export function linkWhatsApp(numero, testo) {
  return `https://wa.me/${String(numero).replace(/\D/g, "")}?text=${encodeURIComponent(testo)}`;
}
