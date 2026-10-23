/* Strumenti condivisi dai test: database in memoria già popolato e un
   server vero su una porta libera, interrogato con fetch. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apriDb } from "../server/db.js";
import { semina } from "../server/seed.js";
import { creaApp } from "../server/app.js";

export const PIN_PROVA = "482915";

export function dbDiProva() {
  const db = apriDb(":memory:");
  semina(db, { pin: PIN_PROVA });
  return db;
}

export async function avviaProva({ now = () => new Date(), db = dbDiProva(), produzione = false } = {}) {
  const cartellaFoto = fs.mkdtempSync(path.join(os.tmpdir(), "serraglio-foto-"));
  const app = creaApp({ db, now, produzione, cartellaFoto });
  const server = await new Promise(ok => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function richiesta(metodo, percorso, { corpo, cookie, origine = base, tipo, grezzo } = {}) {
    const intestazioni = {};
    if (origine) intestazioni.Origin = origine;
    if (cookie) intestazioni.Cookie = cookie;
    let body;
    if (grezzo !== undefined) { body = grezzo; intestazioni["Content-Type"] = tipo; }
    else if (metodo !== "GET") { body = JSON.stringify(corpo ?? {}); intestazioni["Content-Type"] = tipo ?? "application/json"; }
    const r = await fetch(base + percorso, { method: metodo, headers: intestazioni, body, redirect: "manual" });
    const testo = await r.text();
    let json = null;
    try { json = JSON.parse(testo); } catch { /* non JSON */ }
    return { stato: r.status, json, testo, intestazioni: r.headers };
  }

  async function accedi(pin = PIN_PROVA) {
    const r = await richiesta("POST", "/api/admin/login", { corpo: { pin } });
    if (r.stato !== 200) throw new Error(`accesso fallito: ${r.stato}`);
    return r.intestazioni.getSetCookie()[0].split(";")[0];
  }

  const chiudi = () => new Promise(ok => server.close(() => { fs.rmSync(cartellaFoto, { recursive: true, force: true }); ok(); }));
  return { base, db, app, cartellaFoto, richiesta, accedi, chiudi };
}
