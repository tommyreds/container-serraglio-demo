/* Chiamate al server dal pannello.
   Gli errori arrivano già scritti in italiano dal server; se la rete manca
   si dice cosa fare. Una sessione scaduta riporta alla schermata del PIN. */

export const ERRORE_RETE = "Non sono riuscito a salvare. Controlla la connessione e riprova.";

export class ErroreApi extends Error {
  constructor(messaggio, stato) { super(messaggio); this.stato = stato; }
}

let quandoScade = () => {};
export const allaScadenza = fn => { quandoScade = fn; };

export async function api(metodo, percorso, corpo, { grezzo, tipo } = {}) {
  const intestazioni = {};
  let body;
  if (grezzo) { body = grezzo; intestazioni["Content-Type"] = tipo; }
  else if (corpo !== undefined) { body = JSON.stringify(corpo); intestazioni["Content-Type"] = "application/json"; }

  let r;
  try {
    r = await fetch(`api/admin${percorso}`, { method: metodo, headers: intestazioni, body, credentials: "same-origin" });
  } catch {
    throw new ErroreApi(ERRORE_RETE, 0);
  }
  let dati = null;
  try { dati = await r.json(); } catch { /* risposta vuota */ }
  if (r.status === 401 && percorso !== "/login" && percorso !== "/pin") quandoScade();
  if (!r.ok) throw new ErroreApi(dati?.errore || ERRORE_RETE, r.status);
  return dati;
}
