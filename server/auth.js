import crypto from "node:crypto";

/* ---------- PIN di accesso ----------
   Il pannello si apre con un PIN numerico invece che con una password: dal
   telefono si digita sulla tastiera dei numeri, senza cercare maiuscole e
   simboli. Un PIN è più debole di una password lunga, quindi la difesa vera
   sono i limiti sui tentativi.
   Il PIN non si salva mai in chiaro: scrypt, lento apposta, con un sale
   casuale diverso per ogni utente.                                         */

export function creaHash(pin) {
  const sale = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pin), sale, 64).toString("hex");
  return { hash, sale };
}

export function verificaPin(pin, hash, sale) {
  const prova = crypto.scryptSync(String(pin), sale, 64);
  const atteso = Buffer.from(hash, "hex");
  // confronto a tempo costante: non rivela quanti caratteri erano giusti
  return prova.length === atteso.length && crypto.timingSafeEqual(prova, atteso);
}
