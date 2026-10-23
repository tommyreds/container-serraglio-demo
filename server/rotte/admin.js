import express from "express";
import crypto from "node:crypto";
import net from "node:net";
import { leggiMenu, leggiOrari, leggiChiusure, leggiImpostazioni, scriviImpostazione } from "../db.js";
import { oraRoma } from "../../public/lib/orari.js";
import { ALLERGENI, validaAllergeni } from "../../public/lib/allergeni.js";
import { ErroreValidazione, leggiPrezzo, leggiTesto, leggiData, leggiOra, leggiSiNo, VALIDATORI_IMPOSTAZIONI } from "../valida.js";
import { tipoImmagine, dimensioniImmagine, salvaFoto, eliminaFoto } from "../foto.js";
import {
  creaLimitatore,
  verificaPin, creaHash, pinBanale, creaSessione, leggiSessione, chiudiSessione, chiudiAltreSessioni,
  creaGuardiaLogin, descriviDispositivo, registraAccesso, troncaIp
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
  /* Durante un blocco globale possono ancora entrare le reti da cui il
     titolare ha già fatto accesso negli ultimi 30 giorni: chi attacca da
     fuori non può chiudere fuori il locale. */
  const guardia = creaGuardiaLogin({
    fidato: ip => !!db.prepare("SELECT 1 FROM accessi WHERE esito = 'ok' AND ip_troncato = ?").get(troncaIp(ip))
  });
  const MESSAGGI_BLOCCO = {
    ip: ["Troppi tentativi. Riprova fra un quarto d'ora.", 15 * 60],
    globale: ["Troppi tentativi sbagliati da più dispositivi: l'accesso è sospeso per un'ora. Se sei del locale, riprova dal wifi del locale o chiedi a chi gestisce il sito di reimpostare il PIN.", 60 * 60]
  };
  const respingiSeBloccato = (req, res) => {
    const motivo = guardia.motivo(ipDi(req));
    if (!motivo) return false;
    const [errore, secondi] = MESSAGGI_BLOCCO[motivo];
    res.set("Retry-After", String(secondi)).status(429).json({ errore });
    return true;
  };
  /* In produzione, o quando la richiesta arriva in https (anche dal tunnel),
     il cookie è __Host- e Secure. Solo in prova su http locale resta semplice. */
  const sicuro = req => produzione || req.secure;
  const nomeCookie = req => (sicuro(req) ? "__Host-sessione" : "sessione");
  const cookie = (req, valore, maxAge) =>
    `${nomeCookie(req)}=${valore}; HttpOnly;${sicuro(req) ? " Secure;" : ""} SameSite=Strict; Path=/; Max-Age=${maxAge}`;
  const tokenDi = req => leggiCookie(req, "__Host-sessione") ?? (produzione ? null : leggiCookie(req, "sessione"));
  // req.ip può arrivare da un'intestazione: se non è un IP valido si usa quello della connessione
  const ipDi = req => (net.isIP(req.ip || "") ? req.ip : req.socket.remoteAddress || "");

  /* Niente cache: Safari altrimenti riusa la risposta di /menu e il pannello
     mostra dati vecchi subito dopo un salvataggio. */
  r.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  /* Le scritture accettano solo JSON (la foto ha la sua rotta, più avanti). */
  r.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.path.endsWith("/foto")) return next();
    // senza corpo va bene (un DELETE del browser; Safari manda anche Content-Length: 0);
    // con un corpo, deve essere JSON
    const vuoto = req.headers["content-length"] === "0";
    if (!vuoto && req.is("application/json") === false) return res.status(415).json({ errore: "Formato non valido." });
    next();
  });
  r.use(express.json({ limit: "32kb" }));

  const richiediAccesso = (req, res, next) => {
    const token = tokenDi(req);
    const s = leggiSessione(db, token, now());
    if (!s) return res.status(401).json({ errore: "Sessione scaduta, rifai l'accesso." });
    req.utente = s.utente;
    req.token = token;
    next();
  };
  contesto.richiediAccesso = richiediAccesso;

  /* ---------- accesso ---------- */

  r.post("/login", (req, res) => {
    const ip = ipDi(req);
    if (respingiSeBloccato(req, res)) return;

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
    res.setHeader("Set-Cookie", cookie(req, token, DURATA_COOKIE_S));
    res.json({ ok: true });
  });

  r.post("/logout", richiediAccesso, (req, res) => {
    chiudiSessione(db, req.token);
    res.setHeader("Set-Cookie", cookie(req, "", 0));
    res.json({ ok: true });
  });

  r.post("/logout-tutti", richiediAccesso, (req, res) => {
    db.prepare("DELETE FROM sessioni WHERE utente = ?").run(req.utente);
    res.setHeader("Set-Cookie", cookie(req, "", 0));
    res.json({ ok: true });
  });

  r.get("/stato", richiediAccesso, (req, res) => res.json({ utente: req.utente }));

  // all'apertura del pannello: risponde sempre 200, così la console resta pulita
  r.get("/sessione", (req, res) => {
    res.json({ dentro: !!leggiSessione(db, tokenDi(req), now()) });
  });

  r.post("/pin", richiediAccesso, (req, res) => {
    // stesso limite del login: altrimenti una sessione rubata proverebbe PIN all'infinito
    if (respingiSeBloccato(req, res)) return;
    const utente = db.prepare("SELECT * FROM utenti WHERE nome = ?").get(req.utente);
    if (!verificaPin(String(req.body?.attuale ?? "").slice(0, 12), utente.hash, utente.sale)) {
      guardia.fallito(ipDi(req));
      registraAccesso(db, { esito: "ko", dispositivo: descriviDispositivo(req.get("user-agent")), ip: ipDi(req), now: now() });
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

  /* ---------- contenuti ----------
   Ogni scrittura riuscita svuota la cache della pagina pubblica, così il
   cambio si vede subito sul sito. */

  const oggi = () => oraRoma(now()).data;
  const invalida = () => contesto.app.locals.invalida();
  // avvolge una rotta: gli errori di validazione diventano 400 con la frase per il titolare
  // tetto alle modifiche per sessione: ferma uno script, non chi lavora al banco
  const limiteScritture = creaLimitatore();
  const scrive = fn => [richiediAccesso, (req, res, next) => {
    if (!limiteScritture.consenti(req.token, 300, 15 * 60_000)) {
      return res.status(429).json({ errore: "Troppe modifiche ravvicinate, aspetta un attimo." });
    }
    try {
      const esito = fn(req, res);
      if (!res.headersSent) { invalida(); res.status(esito?.stato || 200).json(esito?.corpo || { ok: true }); }
    } catch (e) {
      if (e instanceof ErroreValidazione) return res.status(400).json({ errore: e.message });
      if (e instanceof NonTrovato) return res.status(404).json({ errore: e.message });
      if (e instanceof FormatoFoto) return res.status(415).json({ errore: "Usa una foto JPG, PNG o WebP." });
      next(e);
    }
  }];

  const trovaProdotto = id => db.prepare("SELECT * FROM prodotti WHERE id = ?").get(id) || nonTrovato("Prodotto non trovato.");
  const trovaCategoria = id => db.prepare("SELECT * FROM categorie WHERE id = ?").get(id) || nonTrovato("Categoria non trovata.");
  const nuovoId = nome => `${nome.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "voce"}-${crypto.randomBytes(2).toString("hex")}`;
  const leggiAllergeni = v => validaAllergeni(v) ?? errore("Allergene non riconosciuto.");

  r.get("/menu", richiediAccesso, (req, res) => {
    res.json({
      oggi: oggi(),
      categorie: leggiMenu(db, { oggi: oggi(), ancheNascosti: true }),
      orari: leggiOrari(db),
      chiusure: leggiChiusure(db, oggi()),
      impostazioni: leggiImpostazioni(db, { tutte: true }),
      allergeni: ALLERGENI
    });
  });

  r.post("/prodotti", ...scrive(req => {
    const b = req.body || {};
    const categoria = db.prepare("SELECT id FROM categorie WHERE id = ?").get(String(b.categoria_id ?? ""));
    if (!categoria) errore("Scegli una categoria esistente.");
    const nome = leggiTesto(b.nome, { min: 2, max: 60, campo: "Nome" });
    const id = nuovoId(nome);
    const posizione = (db.prepare("SELECT MAX(posizione) m FROM prodotti").get().m ?? 0) + 1;
    db.prepare(
      `INSERT INTO prodotti (id, categoria_id, nome, descrizione, allergeni, surgelati, prezzo, disponibile, posizione)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(id, categoria.id, nome, leggiTesto(b.descrizione ?? "", { max: 200, campo: "Ingredienti" }),
      leggiAllergeni(b.allergeni ?? []).join(","), leggiSiNo(b.surgelati ?? false),
      b.prezzo === undefined || b.prezzo === null || b.prezzo === "" ? null : leggiPrezzo(b.prezzo), posizione);
    return { stato: 201, corpo: { id } };
  }));

  r.patch("/prodotti/:id", ...scrive(req => {
    const p = trovaProdotto(req.params.id);
    const b = req.body || {};
    const campi = {
      nome: b.nome !== undefined ? leggiTesto(b.nome, { min: 2, max: 60, campo: "Nome" }) : p.nome,
      descrizione: b.descrizione !== undefined ? leggiTesto(b.descrizione, { max: 200, campo: "Ingredienti" }) : p.descrizione,
      allergeni: b.allergeni !== undefined ? leggiAllergeni(b.allergeni).join(",") : p.allergeni,
      surgelati: b.surgelati !== undefined ? leggiSiNo(b.surgelati) : p.surgelati,
      disponibile: b.disponibile !== undefined ? leggiSiNo(b.disponibile) : p.disponibile,
      prezzo: b.prezzo === undefined ? p.prezzo : (b.prezzo === null || b.prezzo === "" ? null : leggiPrezzo(b.prezzo))
    };
    db.prepare(
      `UPDATE prodotti SET nome=@nome, descrizione=@descrizione, allergeni=@allergeni, surgelati=@surgelati,
       disponibile=@disponibile, prezzo=@prezzo WHERE id=@id`
    ).run({ ...campi, id: p.id });
  }));

  r.delete("/prodotti/:id", ...scrive(req => {
    const p = trovaProdotto(req.params.id);
    db.prepare("DELETE FROM prodotti WHERE id = ?").run(p.id);
    eliminaFotoCaricata(p.foto);
  }));

  /* Scambia la posizione con il vicino nella stessa categoria. */
  r.post("/prodotti/:id/sposta", ...scrive(req => {
    const p = trovaProdotto(req.params.id);
    const direzione = req.body?.direzione;
    if (direzione !== "su" && direzione !== "giu") errore("Direzione non valida.");
    const fratelli = db.prepare("SELECT id, posizione FROM prodotti WHERE categoria_id = ? ORDER BY posizione, nome").all(p.categoria_id);
    const i = fratelli.findIndex(x => x.id === p.id);
    const j = direzione === "su" ? i - 1 : i + 1;
    if (j < 0 || j >= fratelli.length) return;
    db.transaction(() => {
      // riassegna posizioni consecutive, così due prodotti non restano mai a pari merito
      [fratelli[i], fratelli[j]] = [fratelli[j], fratelli[i]];
      const base = Math.min(...fratelli.map(x => x.posizione));
      const agg = db.prepare("UPDATE prodotti SET posizione = ? WHERE id = ?");
      fratelli.forEach((x, k) => agg.run(base + k, x.id));
    })();
  }));

  r.put("/prodotti/:id/finito", ...scrive(req => {
    const p = trovaProdotto(req.params.id);
    db.prepare("UPDATE prodotti SET finito_il = ? WHERE id = ?").run(leggiSiNo(req.body?.finito) ? oggi() : null, p.id);
  }));

  r.post("/categorie", ...scrive(req => {
    const nome = leggiTesto(req.body?.nome, { min: 2, max: 60, campo: "Nome" });
    const id = nuovoId(nome);
    const posizione = (db.prepare("SELECT MAX(posizione) m FROM categorie").get().m ?? 0) + 1;
    db.prepare("INSERT INTO categorie (id, nome, nota, prezzo, posizione) VALUES (?, ?, ?, ?, ?)")
      .run(id, nome, leggiTesto(req.body?.nota ?? "", { max: 200, campo: "Nota" }), leggiPrezzo(req.body?.prezzo), posizione);
    return { stato: 201, corpo: { id } };
  }));

  r.patch("/categorie/:id", ...scrive(req => {
    const c = trovaCategoria(req.params.id);
    const b = req.body || {};
    db.prepare("UPDATE categorie SET nome = ?, nota = ?, prezzo = ? WHERE id = ?").run(
      b.nome !== undefined ? leggiTesto(b.nome, { min: 2, max: 60, campo: "Nome" }) : c.nome,
      b.nota !== undefined ? leggiTesto(b.nota, { max: 200, campo: "Nota" }) : c.nota,
      b.prezzo !== undefined ? leggiPrezzo(b.prezzo) : c.prezzo, c.id);
  }));

  r.delete("/categorie/:id", ...scrive((req, res) => {
    const c = trovaCategoria(req.params.id);
    if (db.prepare("SELECT 1 FROM prodotti WHERE categoria_id = ?").get(c.id)) {
      return res.status(409).json({ errore: "Svuota la categoria prima di eliminarla." });
    }
    db.prepare("DELETE FROM categorie WHERE id = ?").run(c.id);
  }));

  r.put("/orari", ...scrive(req => {
    const giorni = req.body?.orari;
    if (!Array.isArray(giorni) || giorni.length !== 7) errore("Servono gli orari di tutti e sette i giorni.");
    const puliti = giorni.map((o, i) => {
      if (!o?.apertura && !o?.chiusura) return [null, null];
      const [a, c] = [leggiOra(o.apertura), leggiOra(o.chiusura)];
      if (a >= c) errore(`${GIORNI[i]}: l'apertura deve venire prima della chiusura.`);
      return [a, c];
    });
    const agg = db.prepare("UPDATE orari SET apertura = ?, chiusura = ? WHERE giorno = ?");
    db.transaction(() => puliti.forEach(([a, c], i) => agg.run(a, c, i)))();
  }));

  /* "Oggi siamo chiusi": la data la decide il server, così un pannello rimasto
     aperto da ieri sul telefono non chiude il giorno sbagliato. */
  r.post("/chiusure/oggi", ...scrive(() => {
    db.prepare("INSERT INTO chiusure (data, motivo) VALUES (?, '') ON CONFLICT(data) DO NOTHING").run(oggi());
  }));
  r.delete("/chiusure/oggi", ...scrive(() => {
    db.prepare("DELETE FROM chiusure WHERE data = ?").run(oggi());
  }));

  r.post("/chiusure", ...scrive(req => {
    const data = leggiData(req.body?.data);
    if (data < oggi()) errore("Quel giorno è già passato.");
    db.prepare(`INSERT INTO chiusure (data, motivo) VALUES (?, ?)
                ON CONFLICT(data) DO UPDATE SET motivo = excluded.motivo`)
      .run(data, leggiTesto(req.body?.motivo ?? "", { max: 60, campo: "Motivo" }));
  }));

  r.delete("/chiusure/:data", ...scrive(req => {
    db.prepare("DELETE FROM chiusure WHERE data = ?").run(leggiData(req.params.data));
  }));

  r.patch("/impostazioni", ...scrive(req => {
    const voci = Object.entries(req.body || {}).filter(([k]) => Object.hasOwn(VALIDATORI_IMPOSTAZIONI, k));
    if (voci.length === 0) errore("Nessuna impostazione da salvare.");
    const pulite = voci.map(([k, v]) => [k, VALIDATORI_IMPOSTAZIONI[k](v)]);   // tutto o niente
    // "aggiornato il" solo se voto o recensioni cambiano davvero: salvare il link non rinfresca la data
    const attuali = leggiImpostazioni(db, { tutte: true });
    if (pulite.some(([k, v]) => (k === "google_voto" || k === "google_recensioni") && v !== (attuali[k] ?? ""))) {
      pulite.push(["google_aggiornato", oggi()]);
    }
    db.transaction(() => pulite.forEach(([k, v]) => scriviImpostazione(db, k, v)))();
  }));

  /* Scorciatoia del pannello: il primo cambia ogni giorno ed è l'operazione
     più frequente. Salvarlo lo rimette anche disponibile. */
  r.put("/primo", ...scrive(req => {
    const descrizione = leggiTesto(req.body?.descrizione ?? "", { max: 200, campo: "Primo del giorno" });
    const p = db.prepare("SELECT id FROM prodotti WHERE categoria_id = 'primi' ORDER BY posizione LIMIT 1").get()
      || nonTrovato("Nel menù non c'è un primo piatto.");
    db.prepare("UPDATE prodotti SET descrizione = ?, finito_il = NULL WHERE id = ?").run(descrizione, p.id);
  }));

  /* ---------- foto ---------- */

  const limiteFoto = creaLimitatore();
  const corpoFoto = express.raw({ type: ["image/webp", "image/jpeg", "image/png"], limit: "3mb" });
  const leggiFoto = (req, res, next) => corpoFoto(req, res, err => {
    if (err?.type === "entity.too.large") return res.status(413).json({ errore: "La foto è troppo grande (massimo 3 MB)." });
    next(err);
  });
  // le foto caricate stanno in "foto/…"; quelle di esempio in "img/…" non si cancellano
  function eliminaFotoCaricata(foto) {
    if (foto?.startsWith("foto/")) eliminaFoto(contesto.cartellaFoto, foto.slice(5));
  }

  r.put("/prodotti/:id/foto", richiediAccesso, (req, res, next) => {
    if (!limiteFoto.consenti(req.token, 30, 3600_000)) {
      return res.status(429).json({ errore: "Troppe foto in poco tempo, riprova fra un po'." });
    }
    next();
  }, leggiFoto, ...scrive(req => {
    const p = trovaProdotto(req.params.id);
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    const tipo = buf && tipoImmagine(buf);
    if (!tipo) throw new FormatoFoto();
    const dim = dimensioniImmagine(buf, tipo);
    if (!dim || dim.larghezza < 1 || dim.altezza < 1 || dim.larghezza > 4000 || dim.altezza > 4000) {
      errore("Non riesco a leggere questa foto, provane un'altra.");
    }
    const foto = `foto/${salvaFoto(contesto.cartellaFoto, buf, tipo)}`;
    db.prepare("UPDATE prodotti SET foto = ? WHERE id = ?").run(foto, p.id);
    eliminaFotoCaricata(p.foto);
    return { corpo: { ok: true, foto } };
  }));

  r.delete("/prodotti/:id/foto", ...scrive(req => {
    const p = trovaProdotto(req.params.id);
    db.prepare("UPDATE prodotti SET foto = NULL WHERE id = ?").run(p.id);
    eliminaFotoCaricata(p.foto);
  }));

  return r;
}

class FormatoFoto extends Error {}

class NonTrovato extends Error {}
const nonTrovato = messaggio => { throw new NonTrovato(messaggio); };
const errore = messaggio => { throw new ErroreValidazione(messaggio); };
const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
