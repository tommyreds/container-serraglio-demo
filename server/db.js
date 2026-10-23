import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qui = path.dirname(fileURLToPath(import.meta.url));
const percorso = process.env.DB_PATH || path.join(qui, "..", "dati", "container.db");

fs.mkdirSync(path.dirname(percorso), { recursive: true });

export const db = new Database(percorso);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(qui, "schema.sql"), "utf8"));

/* ---------- PIN di accesso ----------
   Il pannello si apre con un PIN numerico invece che con una password: dal
   telefono si digita sulla tastiera dei numeri, senza cercare maiuscole e
   simboli. Un PIN è più debole di una password lunga, quindi la difesa vera
   è altrove: il limitatore di tentativi nel server.
   Il PIN non si salva mai in chiaro. Si usa scrypt, una funzione di
   derivazione lenta apposta, con un "sale" casuale diverso per ogni utente,
   così due PIN identici producono hash diversi.                            */

export function creaHash(pin) {
  const sale = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, sale, 64).toString("hex");
  return { hash, sale };
}

export function verificaPin(pin, hash, sale) {
  const prova = crypto.scryptSync(pin, sale, 64);
  const atteso = Buffer.from(hash, "hex");
  // confronto a tempo costante: non rivela quanti caratteri erano giusti
  return prova.length === atteso.length && crypto.timingSafeEqual(prova, atteso);
}

/* ---------- sessioni ---------- */

// sessione lunga: chi sta al banco non deve rifare l'accesso ogni mezza giornata
const DURATA_ORE = 72;

export function creaSessione(utente) {
  const token = crypto.randomBytes(32).toString("hex");
  const scade = new Date(Date.now() + DURATA_ORE * 3600_000).toISOString();
  db.prepare("INSERT INTO sessioni (token, utente, scade_il) VALUES (?, ?, ?)").run(token, utente, scade);
  return { token, scade };
}

export function leggiSessione(token) {
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessioni WHERE token = ?").get(token);
  if (!s) return null;
  if (new Date(s.scade_il) < new Date()) {
    db.prepare("DELETE FROM sessioni WHERE token = ?").run(token);
    return null;
  }
  return s;
}

export function chiudiSessione(token) {
  db.prepare("DELETE FROM sessioni WHERE token = ?").run(token);
}

export function pulisciSessioni() {
  db.prepare("DELETE FROM sessioni WHERE scade_il < ?").run(new Date().toISOString());
}

/* ---------- lettura del menù ---------- */

export function leggiMenu({ soloDisponibili = true } = {}) {
  const categorie = db.prepare("SELECT * FROM categorie ORDER BY posizione, nome").all();
  const prodotti = db.prepare(
    `SELECT * FROM prodotti ${soloDisponibili ? "WHERE disponibile = 1" : ""} ORDER BY posizione, nome`
  ).all();

  return categorie.map(c => ({
    ...c,
    prodotti: prodotti
      .filter(p => p.categoria_id === c.id)
      .map(p => ({ ...p, disponibile: !!p.disponibile, prezzo_finale: p.prezzo ?? c.prezzo }))
  }));
}

export function leggiOrari() {
  return db.prepare("SELECT * FROM orari ORDER BY giorno").all();
}

export function leggiImpostazioni({ tutte = false } = {}) {
  const righe = db.prepare(
    `SELECT chiave, valore FROM impostazioni ${tutte ? "" : "WHERE pubblica = 1"}`
  ).all();
  return Object.fromEntries(righe.map(r => [r.chiave, r.valore]));
}

export function impostazione(chiave, predefinito = null) {
  const r = db.prepare("SELECT valore FROM impostazioni WHERE chiave = ?").get(chiave);
  return r ? r.valore : predefinito;
}

/* ---------- scorte giornaliere ----------
   Il "venduto" non è memorizzato: si calcola ogni volta sommando le righe
   degli ordini di quel giorno. Un contatore separato prima o poi si sfasa
   (ordine annullato, riga corretta a mano); una somma no.                 */

export function leggiScorte(data) {
  const caricati = { categoria: {}, prodotto: {} };
  db.prepare("SELECT ambito, riferimento, quantita FROM scorte WHERE data = ?")
    .all(data)
    .forEach(r => { caricati[r.ambito][r.riferimento] = r.quantita; });

  const venduti = db.prepare(`
    SELECT p.id AS prodotto, p.categoria_id AS categoria, SUM(r.quantita) AS n
    FROM righe_ordine r
    JOIN ordini   o ON o.id = r.ordine_id
    JOIN prodotti p ON p.id = r.prodotto_id
    WHERE o.ritiro_data = ? AND o.stato != 'annullato'
    GROUP BY p.id`).all(data);

  const vProdotto = {}, vCategoria = {};
  venduti.forEach(v => {
    vProdotto[v.prodotto] = v.n;
    vCategoria[v.categoria] = (vCategoria[v.categoria] || 0) + v.n;
  });

  const voce = (ambito, id) => {
    const car = caricati[ambito][id];
    const ven = (ambito === "categoria" ? vCategoria : vProdotto)[id] || 0;
    return {
      caricati: car ?? null,                                   // null = nessun limite
      venduti: ven,
      residuo: car == null ? null : Math.max(0, car - ven)
    };
  };

  const categorie = {}, prodotti = {};
  db.prepare("SELECT id FROM categorie").all().forEach(c => { categorie[c.id] = voce("categoria", c.id); });
  db.prepare("SELECT id FROM prodotti").all().forEach(p => { prodotti[p.id] = voce("prodotto", p.id); });

  return { data, categorie, prodotti };
}

/* Quanti pezzi di un prodotto si possono ancora vendere: vince il vincolo
   più stretto fra scorta del prodotto e pane rimasto nella categoria.
   null significa "nessun limite impostato". */
export function residuoProdotto(scorte, prodottoId, categoriaId) {
  const valori = [scorte.prodotti[prodottoId]?.residuo, scorte.categorie[categoriaId]?.residuo]
    .filter(v => v !== null && v !== undefined);
  return valori.length ? Math.min(...valori) : null;
}

export function scriviScorta(ambito, riferimento, data, quantita) {
  if (quantita === null) {
    db.prepare("DELETE FROM scorte WHERE ambito = ? AND riferimento = ? AND data = ?")
      .run(ambito, riferimento, data);
  } else {
    db.prepare(`INSERT INTO scorte (ambito, riferimento, data, quantita) VALUES (?, ?, ?, ?)
                ON CONFLICT(ambito, riferimento, data) DO UPDATE SET quantita = excluded.quantita`)
      .run(ambito, riferimento, data, quantita);
  }
}
