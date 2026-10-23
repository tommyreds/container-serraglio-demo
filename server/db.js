import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qui = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(qui, "schema.sql"), "utf8");

/* Apre (o crea) il database e applica lo schema. ":memory:" per i test. */
export function apriDb(percorso) {
  if (percorso !== ":memory:") fs.mkdirSync(path.dirname(percorso), { recursive: true });
  const db = new Database(percorso);
  if (percorso !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/* ---------- menù ----------
   "finito" vale solo per il giorno salvato in finito_il: il giorno dopo il
   prodotto torna ordinabile senza che nessuno debba ricordarsene. */

export function leggiMenu(db, { oggi, ancheNascosti = false }) {
  const categorie = db.prepare("SELECT * FROM categorie ORDER BY posizione, nome").all();
  const prodotti = db.prepare(
    `SELECT * FROM prodotti ${ancheNascosti ? "" : "WHERE disponibile = 1"} ORDER BY posizione, nome`
  ).all();

  return categorie.map(c => ({
    ...c,
    prodotti: prodotti
      .filter(p => p.categoria_id === c.id)
      .map(p => ({
        ...p,
        allergeni: p.allergeni ? p.allergeni.split(",") : [],
        surgelati: !!p.surgelati,
        disponibile: !!p.disponibile,
        finito: p.finito_il === oggi,
        prezzo_finale: p.prezzo ?? c.prezzo
      }))
  }));
}

export function leggiOrari(db) {
  return db.prepare("SELECT giorno, apertura, chiusura FROM orari ORDER BY giorno").all();
}

export function leggiChiusure(db, daData) {
  return db.prepare("SELECT data, motivo FROM chiusure WHERE data >= ? ORDER BY data").all(daData);
}

/* ---------- impostazioni ---------- */

export function leggiImpostazioni(db, { tutte = false } = {}) {
  const righe = db.prepare(
    `SELECT chiave, valore FROM impostazioni ${tutte ? "" : "WHERE pubblica = 1"}`
  ).all();
  return Object.fromEntries(righe.map(r => [r.chiave, r.valore]));
}

export function impostazione(db, chiave, predefinito = null) {
  const r = db.prepare("SELECT valore FROM impostazioni WHERE chiave = ?").get(chiave);
  return r ? r.valore : predefinito;
}

export function scriviImpostazione(db, chiave, valore) {
  db.prepare(
    `INSERT INTO impostazioni (chiave, valore) VALUES (?, ?)
     ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore`
  ).run(chiave, String(valore));
}
