/* Avvio del sito. Tutta la logica sta in app.js: qui si leggono le
   impostazioni d'ambiente, si apre il database e si mette in ascolto. */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { apriDb } from "./db.js";
import { verificaPin } from "./auth.js";
import { creaApp } from "./app.js";
import { controlliAvvio } from "./avvio.js";

const qui = path.dirname(fileURLToPath(import.meta.url));
const PRODUZIONE = process.env.NODE_ENV === "production";
const PORTA = Number(process.env.PORT) || 3000;
// in ascolto solo su questo computer, salvo richiesta esplicita (es. hotspot: HOST=0.0.0.0)
const HOST = process.env.HOST || "127.0.0.1";
const BASE_URL = (process.env.BASE_URL || "").replace(/[/]+$/, "");
const dati = path.join(qui, "..", "dati");
const db = apriDb(process.env.DB_PATH || path.join(dati, "container.db"));
const cartellaFoto = process.env.FOTO_DIR || path.join(dati, "foto");
fs.mkdirSync(cartellaFoto, { recursive: true });

const utente = db.prepare("SELECT hash, sale FROM utenti WHERE nome = 'banco'").get();
if (!utente) {
  console.error("Database vuoto: esegui prima  npm run seed");
  process.exit(1);
}
const problema = controlliAvvio({
  produzione: PRODUZIONE, host: HOST, tunnel: process.env.TUNNEL === "1", baseUrl: BASE_URL,
  pinPredefinito: verificaPin("246810", utente.hash, utente.sale)
});
if (problema) {
  console.error(problema);
  process.exit(1);
}

const app = creaApp({ db, produzione: PRODUZIONE, cartellaFoto, baseUrl: BASE_URL, trustProxy: process.env.TRUST_PROXY || "loopback" });
app.listen(PORTA, HOST, () => {
  console.log(`Container Serraglio in ascolto su http://localhost:${PORTA}`);
  console.log(`Pannello di gestione: http://localhost:${PORTA}/admin`);
});
