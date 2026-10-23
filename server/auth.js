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

/* PIN facili da indovinare: cifre tutte uguali, sequenze (anche a cavallo
   del 9→0, avanti o indietro) e il PIN predefinito dell'installazione. */
const SEQUENZA = "0123456789012345";
const INVERSA = [...SEQUENZA].reverse().join("");
export function pinBanale(pin) {
  const p = String(pin);
  return !/^\d{6}$/.test(p) || /^(\d)\1{5}$/.test(p) || SEQUENZA.includes(p) || INVERSA.includes(p) || p === "246810";
}

/* ---------- sessioni ----------
   Il browser tiene un token casuale; il database solo il suo SHA-256, così
   una copia rubata del database non contiene sessioni utilizzabili.
   Scadenza scorrevole: 30 giorni dall'ultimo uso, perché chi sta al banco
   non deve rifare l'accesso ogni mattina sul proprio telefono.            */

const DURATA_MS = 30 * 24 * 3600_000;

export const hashToken = token => crypto.createHash("sha256").update(String(token)).digest("hex");

export function creaSessione(db, { utente, dispositivo, now }) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO sessioni (token_hash, utente, creato_il, ultimo_uso, scade_il, dispositivo)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(hashToken(token), utente, now.toISOString(), now.toISOString(),
    new Date(now.getTime() + DURATA_MS).toISOString(), dispositivo);
  return token;
}

export function leggiSessione(db, token, now) {
  if (!token) return null;
  const token_hash = hashToken(token);
  const s = db.prepare("SELECT utente, scade_il FROM sessioni WHERE token_hash = ?").get(token_hash);
  if (!s) return null;
  if (new Date(s.scade_il) <= now) {
    db.prepare("DELETE FROM sessioni WHERE token_hash = ?").run(token_hash);
    return null;
  }
  db.prepare("UPDATE sessioni SET ultimo_uso = ?, scade_il = ? WHERE token_hash = ?")
    .run(now.toISOString(), new Date(now.getTime() + DURATA_MS).toISOString(), token_hash);
  return { utente: s.utente, token_hash };
}

export function chiudiSessione(db, token) {
  db.prepare("DELETE FROM sessioni WHERE token_hash = ?").run(hashToken(token));
}

export function chiudiAltreSessioni(db, utente, tokenDaTenere) {
  db.prepare("DELETE FROM sessioni WHERE utente = ? AND token_hash != ?").run(utente, hashToken(tokenDaTenere));
}

/* ---------- limiti di frequenza (in memoria) ---------- */

export function creaLimitatore({ now = Date.now } = {}) {
  const contatori = new Map();
  return {
    consenti(chiave, max, finestraMs) {
      const t = now();
      const v = contatori.get(chiave);
      if (!v || t > v.fine) {
        contatori.set(chiave, { n: 1, fine: t + finestraMs });
        if (contatori.size > 10_000) for (const [k, x] of contatori) if (t > x.fine) contatori.delete(k);
        return true;
      }
      v.n += 1;
      return v.n <= max;
    }
  };
}

/* Due difese sul login. Per dispositivo: 5 errori in 15 minuti bloccano
   quell'IP. In totale: 30 errori in un'ora, da qualunque IP, sospendono i
   nuovi accessi per un'ora — contro chi prova da tanti indirizzi diversi.
   Le sessioni già aperte non passano dal login, quindi il titolare che è
   già dentro dal suo telefono non viene chiuso fuori. */
const FINESTRA_IP = 15 * 60_000;
const MAX_IP = 5;
const FINESTRA_TOTALE = 60 * 60_000;
const MAX_TOTALE = 30;

export function creaGuardiaLogin({ now = Date.now, fidato = () => false } = {}) {
  const perIp = new Map();
  let errori = [];
  let pausaFino = 0;
  const recenti = (lista, finestra) => lista.filter(t => now() - t < finestra);

  /* null = può provare; "ip" = troppi errori da qui; "globale" = pausa per tutti
     tranne le reti fidate (quelle da cui il titolare è già entrato). */
  function motivo(ip) {
    if (recenti(perIp.get(ip) || [], FINESTRA_IP).length >= MAX_IP) return "ip";
    if (now() < pausaFino && !fidato(ip)) return "globale";
    return null;
  }

  return {
    motivo,
    bloccato: ip => motivo(ip) !== null,
    fallito(ip) {
      const t = now();
      perIp.set(ip, [...recenti(perIp.get(ip) || [], FINESTRA_IP), t]);
      errori = [...recenti(errori, FINESTRA_TOTALE), t];
      if (errori.length >= MAX_TOTALE) pausaFino = t + FINESTRA_TOTALE;
      if (perIp.size > 10_000) for (const [k, v] of perIp) if (!recenti(v, FINESTRA_IP).length) perIp.delete(k);
    },
    riuscito(ip) {
      perIp.delete(ip);
    }
  };
}

/* ---------- registro degli accessi ----------
   Serve al titolare per accorgersi di tentativi strani. Dell'IP si tiene
   solo la rete (/24 o /48): basta a capire "da dove", non identifica. */

export function troncaIp(ip) {
  const s = String(ip || "");
  const v4 = s.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.\d+$/i);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  if (!s.includes(":")) return "";
  const [testa, coda = ""] = s.split("::");
  const a = testa ? testa.split(":") : [];
  const b = coda ? coda.split(":") : [];
  const gruppi = s.includes("::") ? [...a, ...Array(8 - a.length - b.length).fill("0"), ...b] : a;
  return `${gruppi.slice(0, 3).map(g => g.replace(/^0+(?=.)/, "")).join(":")}::`;
}

export function descriviDispositivo(userAgent) {
  const ua = String(userAgent || "");
  const sistema = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const testo = [sistema, browser].filter(Boolean).join(" · ");
  return (testo || "Dispositivo sconosciuto").slice(0, 40);
}

export function registraAccesso(db, { esito, dispositivo, ip, now }) {
  db.prepare("INSERT INTO accessi (quando, esito, dispositivo, ip_troncato) VALUES (?, ?, ?, ?)")
    .run(now.toISOString(), esito, dispositivo, troncaIp(ip));
  db.prepare("DELETE FROM accessi WHERE quando < ?").run(new Date(now.getTime() - DURATA_MS).toISOString());
}
