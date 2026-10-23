/* Avvio del sito. Tutta la logica sta in app.js: qui si leggono le
   impostazioni d'ambiente, si apre il database e si mette in ascolto. */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { apriDb } from "./db.js";
import { verificaPin } from "./auth.js";
import { creaApp } from "./app.js";

const qui = path.dirname(fileURLToPath(import.meta.url));
const PRODUZIONE = process.env.NODE_ENV === "production";
const PORTA = Number(process.env.PORT) || 3000;
const dati = path.join(qui, "..", "dati");
const db = apriDb(process.env.DB_PATH || path.join(dati, "container.db"));
const cartellaFoto = process.env.FOTO_DIR || path.join(dati, "foto");
fs.mkdirSync(cartellaFoto, { recursive: true });

const utente = db.prepare("SELECT hash, sale FROM utenti WHERE nome = 'banco'").get();
if (!utente) {
  console.error("Database vuoto: esegui prima  npm run seed");
  process.exit(1);
}
if (PRODUZIONE && !/^https:\/\/[^/]+$/.test((process.env.BASE_URL || "").replace(/[/]+$/, ""))) {
  console.error("In produzione serve BASE_URL con https, es. BASE_URL=https://containerserraglio.it");
  process.exit(1);
}
if (PRODUZIONE && verificaPin("246810", utente.hash, utente.sale)) {
  console.error("Cambia il PIN predefinito prima di andare online: npm run seed -- --pin=XXXXXX");
  process.exit(1);
}

const app = creaApp({ db, produzione: PRODUZIONE, cartellaFoto, baseUrl: (process.env.BASE_URL || "").replace(/[/]+$/, "") });
app.listen(PORTA, () => {
  console.log(`Container Serraglio in ascolto su http://localhost:${PORTA}`);
  console.log(`Pannello di gestione: http://localhost:${PORTA}/admin`);
});
