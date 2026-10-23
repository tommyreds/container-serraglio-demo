import express from "express";
import {
  verificaPin, creaHash, pinBanale, creaSessione, leggiSessione, chiudiSessione, chiudiAltreSessioni,
  creaGuardiaLogin, descriviDispositivo, registraAccesso
} from "../auth.js";

const DURATA_COOKIE_S = 30 * 24 * 3600;

function leggiCookie(req, nome) {
  for (const parte of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return v.join("=");
  }
  return null;
}

export function rotteAdmin(contesto) {
  const { db, now, produzione } = contesto;
  const r = express.Router();
  const guardia = creaGuardiaLogin();
  const NOME_COOKIE = produzione ? "__Host-sessione" : "sessione";
  const cookie = (valore, maxAge) =>
    `${NOME_COOKIE}=${valore}; HttpOnly;${produzione ? " Secure;" : ""} SameSite=Strict; Path=/; Max-Age=${maxAge}`;

  /* Le scritture accettano solo JSON (la foto ha la sua rotta, più avanti). */
  r.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.path.endsWith("/foto")) return next();
    if (!req.is("application/json")) return res.status(415).json({ errore: "Formato non valido." });
    next();
  });
  r.use(express.json({ limit: "32kb" }));

  const richiediAccesso = (req, res, next) => {
    const token = leggiCookie(req, NOME_COOKIE);
    const s = leggiSessione(db, token, now());
    if (!s) return res.status(401).json({ errore: "Sessione scaduta, rifai l'accesso." });
    req.utente = s.utente;
    req.token = token;
    next();
  };
  contesto.richiediAccesso = richiediAccesso;

  /* ---------- accesso ---------- */

  r.post("/login", (req, res) => {
    const ip = req.ip || "";
    if (guardia.bloccato(ip)) return res.status(429).json({ errore: "Troppi tentativi. Riprova fra un quarto d'ora." });

    const pin = String(req.body?.pin ?? "").slice(0, 12);
    const utente = db.prepare("SELECT * FROM utenti WHERE nome = 'banco'").get();
    const dispositivo = descriviDispositivo(req.get("user-agent"));
    // stesso messaggio in ogni caso di errore: non si dice cosa era sbagliato
    if (!utente || !verificaPin(pin, utente.hash, utente.sale)) {
      guardia.fallito(ip);
      registraAccesso(db, { esito: "ko", dispositivo, ip, now: now() });
      return res.status(401).json({ errore: "PIN non valido." });
    }
    guardia.riuscito(ip);
    registraAccesso(db, { esito: "ok", dispositivo, ip, now: now() });
    const token = creaSessione(db, { utente: utente.nome, dispositivo, now: now() });
    res.setHeader("Set-Cookie", cookie(token, DURATA_COOKIE_S));
    res.json({ ok: true });
  });

  r.post("/logout", richiediAccesso, (req, res) => {
    chiudiSessione(db, req.token);
    res.setHeader("Set-Cookie", cookie("", 0));
    res.json({ ok: true });
  });

  r.post("/logout-tutti", richiediAccesso, (req, res) => {
    db.prepare("DELETE FROM sessioni WHERE utente = ?").run(req.utente);
    res.setHeader("Set-Cookie", cookie("", 0));
    res.json({ ok: true });
  });

  r.get("/stato", richiediAccesso, (req, res) => res.json({ utente: req.utente }));

  r.post("/pin", richiediAccesso, (req, res) => {
    const utente = db.prepare("SELECT * FROM utenti WHERE nome = ?").get(req.utente);
    if (!verificaPin(String(req.body?.attuale ?? ""), utente.hash, utente.sale)) {
      return res.status(401).json({ errore: "Il PIN attuale non è giusto." });
    }
    const nuovo = String(req.body?.nuovo ?? "");
    if (pinBanale(nuovo)) {
      return res.status(400).json({ errore: "Scegli un PIN meno prevedibile: niente cifre uguali o in sequenza." });
    }
    const { hash, sale } = creaHash(nuovo);
    db.prepare("UPDATE utenti SET hash = ?, sale = ? WHERE nome = ?").run(hash, sale, req.utente);
    chiudiAltreSessioni(db, req.utente, req.token);
    res.json({ ok: true });
  });

  r.get("/accessi", richiediAccesso, (req, res) => {
    res.json({
      accessi: db.prepare("SELECT quando, esito, dispositivo, ip_troncato FROM accessi ORDER BY id DESC LIMIT 20").all()
    });
  });

  return r;
}
