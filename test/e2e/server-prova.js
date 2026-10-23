/* Server per i test nel browser: database nuovo in una cartella temporanea,
   popolato con il menù di esempio e il PIN di prova. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apriDb } from "../../server/db.js";
import { semina } from "../../server/seed.js";
import { creaApp } from "../../server/app.js";

const cartella = fs.mkdtempSync(path.join(os.tmpdir(), "serraglio-e2e-"));
const db = apriDb(path.join(cartella, "prova.db"));
semina(db, { pin: "482915" });
const cartellaFoto = path.join(cartella, "foto");
fs.mkdirSync(cartellaFoto);

const porta = Number(process.env.PORT) || 3100;
creaApp({ db, cartellaFoto }).listen(porta, "127.0.0.1", () => console.log(`pronto su ${porta}`));
process.on("SIGTERM", () => { fs.rmSync(cartella, { recursive: true, force: true }); process.exit(0); });
