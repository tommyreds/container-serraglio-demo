-- Container Serraglio — struttura del database
-- I prezzi sono per categoria (il menù del locale funziona così).
-- Un prodotto può avere un prezzo proprio: se è NULL vale quello della categoria.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categorie (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  nota      TEXT NOT NULL DEFAULT '',
  prezzo    REAL NOT NULL,
  posizione INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prodotti (
  id           TEXT PRIMARY KEY,
  categoria_id TEXT NOT NULL REFERENCES categorie(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  descrizione  TEXT NOT NULL DEFAULT '',
  allergeni    TEXT NOT NULL DEFAULT '',
  foto         TEXT,
  prezzo       REAL,
  disponibile  INTEGER NOT NULL DEFAULT 1,
  posizione    INTEGER NOT NULL DEFAULT 0
);

-- giorno: 0 = lunedì ... 6 = domenica. apertura NULL = chiuso
CREATE TABLE IF NOT EXISTS orari (
  giorno   INTEGER PRIMARY KEY,
  apertura TEXT,
  chiusura TEXT
);

CREATE TABLE IF NOT EXISTS impostazioni (
  chiave   TEXT PRIMARY KEY,
  valore   TEXT NOT NULL,
  pubblica INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ordini (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  codice      TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  ritiro_data TEXT NOT NULL,
  ritiro_ora  TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  totale      REAL NOT NULL,
  stato       TEXT NOT NULL DEFAULT 'ricevuto',
  creato_il   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ordini_fascia ON ordini(ritiro_data, ritiro_ora);

CREATE TABLE IF NOT EXISTS righe_ordine (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ordine_id   INTEGER NOT NULL REFERENCES ordini(id) ON DELETE CASCADE,
  prodotto_id TEXT,
  nome        TEXT NOT NULL,
  prezzo      REAL NOT NULL,
  quantita    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS utenti (
  nome TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  sale TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessioni (
  token     TEXT PRIMARY KEY,
  utente    TEXT NOT NULL,
  scade_il  TEXT NOT NULL
);

-- Scorte giornaliere.
-- ambito 'categoria' = pezzi di pane consegnati dal panificio per quel giorno,
-- condivisi fra tutte le varianti della categoria.
-- ambito 'prodotto'  = limite sul singolo prodotto (ingrediente contato).
-- Nessuna riga per un giorno = nessun limite per quel giorno.
-- Il venduto NON è una colonna: si ricava dagli ordini, così non può sfasarsi.
CREATE TABLE IF NOT EXISTS scorte (
  ambito      TEXT    NOT NULL CHECK (ambito IN ('categoria','prodotto')),
  riferimento TEXT    NOT NULL,
  data        TEXT    NOT NULL,
  quantita    INTEGER NOT NULL CHECK (quantita >= 0),
  PRIMARY KEY (ambito, riferimento, data)
);
