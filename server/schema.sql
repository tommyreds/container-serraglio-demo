-- Container Serraglio — struttura del database
-- Il sito non registra ordini: qui ci sono solo menù, orari, impostazioni
-- e l'accesso al pannello. Nessun dato dei clienti.
-- I prezzi sono per categoria; un prodotto con prezzo NULL usa quello della categoria.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categorie (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  nota      TEXT NOT NULL DEFAULT '',
  prezzo    REAL NOT NULL,
  posizione INTEGER NOT NULL DEFAULT 0
);

-- allergeni: codici separati da virgola (vedi public/lib/allergeni.js)
-- disponibile: 0 = nascosto dal menù senza cancellarlo
-- finito_il: data (AAAA-MM-GG) in cui è finito; il giorno dopo torna da solo
CREATE TABLE IF NOT EXISTS prodotti (
  id           TEXT PRIMARY KEY,
  categoria_id TEXT NOT NULL REFERENCES categorie(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  descrizione  TEXT NOT NULL DEFAULT '',
  allergeni    TEXT NOT NULL DEFAULT '',
  surgelati    INTEGER NOT NULL DEFAULT 0,
  foto         TEXT,
  prezzo       REAL,
  disponibile  INTEGER NOT NULL DEFAULT 1,
  finito_il    TEXT,
  posizione    INTEGER NOT NULL DEFAULT 0
);

-- giorno: 0 = lunedì ... 6 = domenica. apertura NULL = chiuso
CREATE TABLE IF NOT EXISTS orari (
  giorno   INTEGER PRIMARY KEY CHECK (giorno BETWEEN 0 AND 6),
  apertura TEXT,
  chiusura TEXT
);

-- chiusure straordinarie (feste, ferie, imprevisti)
CREATE TABLE IF NOT EXISTS chiusure (
  data   TEXT PRIMARY KEY,
  motivo TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS impostazioni (
  chiave   TEXT PRIMARY KEY,
  valore   TEXT NOT NULL,
  pubblica INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS utenti (
  nome TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  sale TEXT NOT NULL
);

-- il token non si salva: solo il suo SHA-256
CREATE TABLE IF NOT EXISTS sessioni (
  token_hash  TEXT PRIMARY KEY,
  utente      TEXT NOT NULL,
  creato_il   TEXT NOT NULL,
  ultimo_uso  TEXT NOT NULL,
  scade_il    TEXT NOT NULL,
  dispositivo TEXT NOT NULL DEFAULT ''
);

-- registro dei tentativi di accesso, tenuto 30 giorni, IP troncato
CREATE TABLE IF NOT EXISTS accessi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quando      TEXT NOT NULL,
  esito       TEXT NOT NULL CHECK (esito IN ('ok','ko')),
  dispositivo TEXT NOT NULL DEFAULT '',
  ip_troncato TEXT NOT NULL DEFAULT ''
);
