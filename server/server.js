import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  db, verificaPin, creaHash, creaSessione, leggiSessione, chiudiSessione,
  pulisciSessioni, leggiMenu, leggiOrari, leggiImpostazioni, impostazione,
  leggiScorte, residuoProdotto, scriviScorta
} from "./db.js";

const qui = path.dirname(fileURLToPath(import.meta.url));
const PORTA = process.env.PORT || 3000;
const PRODUZIONE = process.env.NODE_ENV === "production";

const app = express();
app.use(express.json({ limit: "32kb" }));
app.set("trust proxy", 1);

/* ---------- intestazioni di sicurezza ---------- */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join("; "));
  next();
});

/* ---------- utilità ---------- */

const ORA_LOCALE = () => new Date();
const aData = d => d.toLocaleDateString("sv-SE");           // AAAA-MM-GG
const aMinuti = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const aOra = n => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const indiceGiorno = d => (d.getDay() + 6) % 7;             // 0 = lunedì
const num = (v, pre) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : pre; };
const testo = (v, max) => String(v ?? "").trim().slice(0, max);

function erroreValidazione(res, messaggio) {
  return res.status(400).json({ errore: messaggio });
}

/* Limitatore di frequenza: tiene in memoria quante richieste ha fatto un IP
   in una finestra di tempo. Non è una difesa seria contro un attacco mirato,
   ma evita che un singolo client riempia il database di ordini finti. */
const contatori = new Map();
function limita(chiave, max, finestraMs) {
  const ora = Date.now();
  const v = contatori.get(chiave);
  if (!v || ora > v.fine) {
    contatori.set(chiave, { n: 1, fine: ora + finestraMs });
    return true;
  }
  v.n += 1;
  return v.n <= max;
}
setInterval(() => {
  const ora = Date.now();
  for (const [k, v] of contatori) if (ora > v.fine) contatori.delete(k);
}, 60_000).unref();

/* ---------- fasce di ritiro ---------- */

function fasceDisponibili(giorniAvanti = 2) {
  const orari = leggiOrari();
  const passo = num(impostazione("passo_fascia"), 10);
  const anticipo = num(impostazione("anticipo_minimo"), 15);
  const capienza = num(impostazione("capienza_fascia"), 6);
  const adesso = ORA_LOCALE();

  const conta = db.prepare(
    "SELECT ritiro_data, ritiro_ora, COUNT(*) n FROM ordini WHERE stato != 'annullato' AND ritiro_data >= ? GROUP BY ritiro_data, ritiro_ora"
  ).all(aData(adesso));
  const occupati = new Map(conta.map(r => [`${r.ritiro_data} ${r.ritiro_ora}`, r.n]));

  const fasce = [];
  for (let salto = 0; salto <= giorniAvanti; salto++) {
    const giorno = new Date(adesso);
    giorno.setDate(giorno.getDate() + salto);
    const o = orari.find(x => x.giorno === indiceGiorno(giorno));
    if (!o || !o.apertura) continue;

    let inizio = aMinuti(o.apertura);
    if (salto === 0) {
      const prima = adesso.getHours() * 60 + adesso.getMinutes() + anticipo;
      inizio = Math.max(inizio, Math.ceil(prima / passo) * passo);
    }
    const fine = aMinuti(o.chiusura) - passo;
    const data = aData(giorno);

    for (let t = inizio; t <= fine; t += passo) {
      const ora = aOra(t);
      const liberi = capienza - (occupati.get(`${data} ${ora}`) || 0);
      fasce.push({
        data, ora, liberi: Math.max(0, liberi),
        etichetta: (salto === 0 ? "oggi" : salto === 1 ? "domani" : data.split("-").reverse().slice(0, 2).join("/")) + ` alle ${ora}`
      });
    }
  }
  return fasce;
}

/* ---------- API pubbliche ---------- */

const dataValida = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null;

app.get("/api/menu", (req, res) => {
  const data = dataValida(req.query.data) || aData(ORA_LOCALE());
  const scorte = leggiScorte(data);
  const categorie = leggiMenu({ soloDisponibili: false }).map(c => ({
    ...c,
    residuo: scorte.categorie[c.id]?.residuo ?? null,
    prodotti: c.prodotti.map(p => ({ ...p, residuo: residuoProdotto(scorte, p.id, c.id) }))
  }));
  res.json({ data, categorie, orari: leggiOrari(), impostazioni: leggiImpostazioni() });
});

/* Residui per un giorno diverso da oggi: serve al sito quando l'utente
   sceglie una fascia di ritiro di domani. */
app.get("/api/disponibilita", (req, res) => {
  const data = dataValida(req.query.data) || aData(ORA_LOCALE());
  const scorte = leggiScorte(data);
  const prodotti = db.prepare("SELECT id, categoria_id FROM prodotti").all();
  res.json({
    data,
    residui: Object.fromEntries(prodotti.map(p => [p.id, residuoProdotto(scorte, p.id, p.categoria_id)])),
    categorie: Object.fromEntries(Object.entries(scorte.categorie).map(([k, v]) => [k, v.residuo]))
  });
});

app.get("/api/fasce", (req, res) => {
  res.json({ fasce: fasceDisponibili().filter(f => f.liberi > 0) });
});

app.post("/api/ordini", (req, res) => {
  const ip = req.ip || "ignoto";
  if (!limita(`ordine:${ip}`, 5, 10 * 60_000)) {
    return res.status(429).json({ errore: "Troppi ordini ravvicinati da questo dispositivo. Riprova fra qualche minuto." });
  }
  if (impostazione("ordini_attivi", "1") !== "1") {
    return res.status(503).json({ errore: "Gli ordini online sono sospesi in questo momento." });
  }

  const nome = testo(req.body?.nome, 40);
  const note = testo(req.body?.note, 300);
  const data = testo(req.body?.ritiro_data, 10);
  const ora = testo(req.body?.ritiro_ora, 5);
  const righe = Array.isArray(req.body?.righe) ? req.body.righe.slice(0, 30) : [];

  if (nome.length < 2) return erroreValidazione(res, "Serve un nome per il ritiro.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(ora)) {
    return erroreValidazione(res, "Fascia di ritiro non valida.");
  }
  if (righe.length === 0) return erroreValidazione(res, "L’ordine è vuoto.");

  // la fascia deve essere una di quelle effettivamente proposte e con posto libero
  const fascia = fasceDisponibili().find(f => f.data === data && f.ora === ora);
  if (!fascia) return erroreValidazione(res, "Quella fascia non è più disponibile.");
  if (fascia.liberi <= 0) return erroreValidazione(res, "Quella fascia è al completo, scegline un’altra.");

  // i prezzi si ricalcolano qui: quelli arrivati dal browser non contano
  const leggiProdotto = db.prepare(
    `SELECT p.id, p.nome, p.disponibile, p.categoria_id, COALESCE(p.prezzo, c.prezzo) AS prezzo
     FROM prodotti p JOIN categorie c ON c.id = p.categoria_id WHERE p.id = ?`
  );

  const voci = [];
  for (const r of righe) {
    const quantita = num(r?.quantita, 0);
    if (quantita < 1 || quantita > 20) return erroreValidazione(res, "Quantità non valida.");
    const p = leggiProdotto.get(testo(r?.id, 40));
    if (!p) return erroreValidazione(res, "Un prodotto dell’ordine non esiste più.");
    if (!p.disponibile) return erroreValidazione(res, `${p.nome} è esaurito: toglilo dall’ordine.`);
    // se lo stesso prodotto arriva su più righe le sommo in una sola
    const gia = voci.find(v => v.id === p.id);
    if (gia) gia.quantita += quantita;
    else voci.push({ id: p.id, nome: p.nome, prezzo: p.prezzo, categoria_id: p.categoria_id, quantita });
  }

  const totale = voci.reduce((a, v) => a + v.prezzo * v.quantita, 0);
  const codice = crypto.randomBytes(3).toString("hex").toUpperCase();

  /* Controllo delle scorte DENTRO la transazione: fra il momento in cui il
     sito mostra "ne restano 3" e il momento in cui l'ordine arriva, qualcun
     altro può averli presi. Qui si rilegge e, se non bastano, non si scrive
     niente. Le quantità si sommano per categoria perché il pane è in comune. */
  const perCategoria = new Map();
  voci.forEach(v => perCategoria.set(v.categoria_id, (perCategoria.get(v.categoria_id) || 0) + v.quantita));

  let mancante = null;

  const salva = db.transaction(() => {
    const scorte = leggiScorte(data);

    for (const v of voci) {
      const r = scorte.prodotti[v.id]?.residuo;
      if (r !== null && r !== undefined && v.quantita > r) {
        mancante = r === 0
          ? `${v.nome} è finito per ${data === aData(ORA_LOCALE()) ? "oggi" : "quel giorno"}.`
          : `Di ${v.nome} ne restano solo ${r}.`;
        return null;
      }
    }
    for (const [categoria, quantita] of perCategoria) {
      const r = scorte.categorie[categoria]?.residuo;
      if (r !== null && r !== undefined && quantita > r) {
        const nome = db.prepare("SELECT nome FROM categorie WHERE id = ?").get(categoria)?.nome || "prodotti";
        mancante = r === 0
          ? `${nome}: le scorte del giorno sono finite.`
          : `${nome}: ne restano solo ${r} in tutto, riduci le quantità.`;
        return null;
      }
    }

    const r = db.prepare(
      `INSERT INTO ordini (codice, nome, ritiro_data, ritiro_ora, note, totale, stato, creato_il)
       VALUES (?, ?, ?, ?, ?, ?, 'ricevuto', ?)`
    ).run(codice, nome, data, ora, note, totale, new Date().toISOString());

    const riga = db.prepare(
      "INSERT INTO righe_ordine (ordine_id, prodotto_id, nome, prezzo, quantita) VALUES (?, ?, ?, ?, ?)"
    );
    voci.forEach(v => riga.run(r.lastInsertRowid, v.id, v.nome, v.prezzo, v.quantita));
    return r.lastInsertRowid;
  });

  const id = salva();
  if (mancante) return res.status(409).json({ errore: mancante });
  res.status(201).json({ id, codice, totale, voci, ritiro: fascia.etichetta });
});

/* ---------- autenticazione del pannello ---------- */

function leggiCookie(req, nome) {
  const grezzo = req.headers.cookie || "";
  for (const parte of grezzo.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return decodeURIComponent(v.join("="));
  }
  return null;
}

function richiediAccesso(req, res, next) {
  const s = leggiSessione(leggiCookie(req, "sessione"));
  if (!s) return res.status(401).json({ errore: "Sessione scaduta, rifai l’accesso." });
  req.utente = s.utente;
  next();
}

app.post("/api/admin/login", (req, res) => {
  const ip = req.ip || "ignoto";
  /* Un PIN di sei cifre ha un milione di combinazioni: a mano è tanto, a
     macchina è poco. La difesa è il limitatore, non la lunghezza del PIN. */
  if (!limita(`login:${ip}`, 6, 15 * 60_000)) {
    return res.status(429).json({ errore: "Troppi tentativi. Riprova fra un quarto d’ora." });
  }
  const pin = String(req.body?.pin ?? "");
  const utente = db.prepare("SELECT * FROM utenti WHERE nome = 'banco'").get();

  // messaggio identico in ogni caso di fallimento: non si dice cosa era sbagliato
  if (!utente || !verificaPin(pin, utente.hash, utente.sale)) {
    return res.status(401).json({ errore: "PIN non valido." });
  }

  pulisciSessioni();
  const { token } = creaSessione(utente.nome);
  res.setHeader("Set-Cookie",
    `sessione=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${72 * 3600}${PRODUZIONE ? "; Secure" : ""}`);
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = leggiCookie(req, "sessione");
  if (token) chiudiSessione(token);
  res.setHeader("Set-Cookie", "sessione=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/admin/stato", richiediAccesso, (req, res) => res.json({ utente: req.utente }));

app.post("/api/admin/pin", richiediAccesso, (req, res) => {
  const nuovo = String(req.body?.pin ?? "");
  if (!/^\d{6}$/.test(nuovo)) return erroreValidazione(res, "Il PIN deve essere di sei cifre.");
  if (/^(\d)\1{5}$/.test(nuovo) || "012345678901234".includes(nuovo)) {
    return erroreValidazione(res, "Scegli un PIN meno prevedibile: non tutte cifre uguali o in sequenza.");
  }
  const { hash, sale } = creaHash(nuovo);
  db.prepare("UPDATE utenti SET hash = ?, sale = ? WHERE nome = ?").run(hash, sale, req.utente);
  res.json({ ok: true });
});

/* ---------- API del pannello ---------- */

app.get("/api/admin/menu", richiediAccesso, (req, res) => {
  res.json({
    categorie: leggiMenu({ soloDisponibili: false }),
    orari: leggiOrari(),
    impostazioni: leggiImpostazioni({ tutte: true })
  });
});

app.patch("/api/admin/prodotti/:id", richiediAccesso, (req, res) => {
  const p = db.prepare("SELECT * FROM prodotti WHERE id = ?").get(req.params.id);
  if (!p) return res.status(404).json({ errore: "Prodotto non trovato." });

  const campi = {
    nome: req.body.nome !== undefined ? testo(req.body.nome, 60) : p.nome,
    descrizione: req.body.descrizione !== undefined ? testo(req.body.descrizione, 200) : p.descrizione,
    allergeni: req.body.allergeni !== undefined ? testo(req.body.allergeni, 200) : p.allergeni,
    disponibile: req.body.disponibile !== undefined ? (req.body.disponibile ? 1 : 0) : p.disponibile,
    prezzo: req.body.prezzo !== undefined
      ? (req.body.prezzo === null || req.body.prezzo === "" ? null : Number(req.body.prezzo))
      : p.prezzo
  };
  if (campi.prezzo !== null && (!Number.isFinite(campi.prezzo) || campi.prezzo < 0 || campi.prezzo > 500)) {
    return erroreValidazione(res, "Prezzo non valido.");
  }
  if (campi.nome.length < 2) return erroreValidazione(res, "Il nome è troppo corto.");

  db.prepare(
    "UPDATE prodotti SET nome=@nome, descrizione=@descrizione, allergeni=@allergeni, disponibile=@disponibile, prezzo=@prezzo WHERE id=@id"
  ).run({ ...campi, id: p.id });
  res.json({ ok: true });
});

app.post("/api/admin/prodotti", richiediAccesso, (req, res) => {
  const categoria = testo(req.body?.categoria_id, 40);
  if (!db.prepare("SELECT 1 FROM categorie WHERE id = ?").get(categoria)) {
    return erroreValidazione(res, "Categoria inesistente.");
  }
  const nome = testo(req.body?.nome, 60);
  if (nome.length < 2) return erroreValidazione(res, "Serve un nome.");

  const id = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) + "-" + crypto.randomBytes(2).toString("hex");
  const posizione = (db.prepare("SELECT MAX(posizione) m FROM prodotti").get().m ?? 0) + 1;
  db.prepare(
    `INSERT INTO prodotti (id, categoria_id, nome, descrizione, allergeni, foto, prezzo, disponibile, posizione)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, ?)`
  ).run(id, categoria, nome, testo(req.body?.descrizione, 200), testo(req.body?.allergeni, 200), posizione);
  res.status(201).json({ id });
});

app.delete("/api/admin/prodotti/:id", richiediAccesso, (req, res) => {
  db.prepare("DELETE FROM prodotti WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.patch("/api/admin/categorie/:id", richiediAccesso, (req, res) => {
  const c = db.prepare("SELECT * FROM categorie WHERE id = ?").get(req.params.id);
  if (!c) return res.status(404).json({ errore: "Categoria non trovata." });
  const prezzo = req.body.prezzo !== undefined ? Number(req.body.prezzo) : c.prezzo;
  if (!Number.isFinite(prezzo) || prezzo < 0 || prezzo > 500) return erroreValidazione(res, "Prezzo non valido.");
  db.prepare("UPDATE categorie SET nome = ?, nota = ?, prezzo = ? WHERE id = ?").run(
    req.body.nome !== undefined ? testo(req.body.nome, 60) : c.nome,
    req.body.nota !== undefined ? testo(req.body.nota, 300) : c.nota,
    prezzo, c.id
  );
  res.json({ ok: true });
});

app.put("/api/admin/orari", richiediAccesso, (req, res) => {
  const giorni = Array.isArray(req.body?.orari) ? req.body.orari : [];
  const valido = o => o.apertura === null || /^\d{2}:\d{2}$/.test(o.apertura);
  if (giorni.length !== 7 || !giorni.every(o => valido(o) && (o.chiusura === null || /^\d{2}:\d{2}$/.test(o.chiusura)))) {
    return erroreValidazione(res, "Orari non validi.");
  }
  const agg = db.prepare("UPDATE orari SET apertura = ?, chiusura = ? WHERE giorno = ?");
  db.transaction(() => giorni.forEach((o, i) => agg.run(o.apertura || null, o.chiusura || null, i)))();
  res.json({ ok: true });
});

const MODIFICABILI = new Set([
  "nome_attivita", "telefono", "whatsapp", "indirizzo", "email", "instagram", "facebook",
  "ragione_sociale", "piva", "codice_fiscale", "pec", "titolare_trattamento",
  "nota_prezzi", "passo_fascia", "anticipo_minimo", "capienza_fascia", "giorni_conservazione", "ordini_attivi"
]);

app.patch("/api/admin/impostazioni", richiediAccesso, (req, res) => {
  const voci = Object.entries(req.body || {}).filter(([k]) => MODIFICABILI.has(k));
  if (voci.length === 0) return erroreValidazione(res, "Nessuna impostazione valida.");
  const agg = db.prepare("UPDATE impostazioni SET valore = ? WHERE chiave = ?");
  db.transaction(() => voci.forEach(([k, v]) => agg.run(testo(v, 300), k)))();
  res.json({ ok: true });
});

/* Scorciatoia del pannello: il primo piatto cambia ogni giorno ed è
   l'operazione più frequente. Qui si aggiorna con una sola chiamata
   invece di passare dalla modifica generica dei prodotti. */
app.put("/api/admin/primo", richiediAccesso, (req, res) => {
  const descrizione = testo(req.body?.descrizione, 200);
  const prodotto = db.prepare(
    "SELECT p.id FROM prodotti p WHERE p.categoria_id = 'primi' ORDER BY p.posizione LIMIT 1"
  ).get();
  if (!prodotto) return res.status(404).json({ errore: "Nessun primo piatto in menù." });
  db.prepare("UPDATE prodotti SET descrizione = ?, disponibile = 1 WHERE id = ?").run(descrizione, prodotto.id);
  res.json({ ok: true, id: prodotto.id, descrizione });
});

app.get("/api/admin/scorte", richiediAccesso, (req, res) => {
  const data = dataValida(req.query.data) || aData(ORA_LOCALE());
  res.json(leggiScorte(data));
});

app.put("/api/admin/scorte", richiediAccesso, (req, res) => {
  const data = dataValida(req.body?.data);
  if (!data) return erroreValidazione(res, "Data non valida.");

  // valore vuoto o null = nessun limite per quel giorno
  const pulisci = valore => {
    if (valore === null || valore === undefined || valore === "") return null;
    const n = Number(valore);
    if (!Number.isInteger(n) || n < 0 || n > 10_000) return undefined;   // undefined = errore
    return n;
  };

  const voci = [];
  for (const ambito of ["categorie", "prodotti"]) {
    for (const [id, valore] of Object.entries(req.body?.[ambito] || {})) {
      const q = pulisci(valore);
      if (q === undefined) return erroreValidazione(res, "Quantità non valida: usa un numero intero.");
      voci.push([ambito === "categorie" ? "categoria" : "prodotto", testo(id, 40), q]);
    }
  }
  if (voci.length === 0) return erroreValidazione(res, "Nessuna scorta da salvare.");

  db.transaction(() => voci.forEach(([a, id, q]) => scriviScorta(a, id, data, q)))();
  res.json(leggiScorte(data));
});

/* Ricarica le scorte copiando quelle di un altro giorno: al mattino evita
   di riscrivere gli stessi numeri quando la consegna è sempre la stessa. */
app.post("/api/admin/scorte/copia", richiediAccesso, (req, res) => {
  const da = dataValida(req.body?.da);
  const a = dataValida(req.body?.a);
  if (!da || !a) return erroreValidazione(res, "Date non valide.");
  const righe = db.prepare("SELECT ambito, riferimento, quantita FROM scorte WHERE data = ?").all(da);
  if (righe.length === 0) return erroreValidazione(res, "Quel giorno non ha scorte impostate.");
  db.transaction(() => righe.forEach(r => scriviScorta(r.ambito, r.riferimento, a, r.quantita)))();
  res.json(leggiScorte(a));
});

app.get("/api/admin/ordini", richiediAccesso, (req, res) => {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || "") ? req.query.data : aData(ORA_LOCALE());
  const ordini = db.prepare("SELECT * FROM ordini WHERE ritiro_data = ? ORDER BY ritiro_ora, id").all(data);
  const righe = db.prepare(
    "SELECT r.* FROM righe_ordine r JOIN ordini o ON o.id = r.ordine_id WHERE o.ritiro_data = ?"
  ).all(data);
  res.json({
    data,
    ordini: ordini.map(o => ({ ...o, righe: righe.filter(r => r.ordine_id === o.id) }))
  });
});

const STATI = new Set(["ricevuto", "in preparazione", "pronto", "ritirato", "annullato"]);

app.patch("/api/admin/ordini/:id", richiediAccesso, (req, res) => {
  const stato = String(req.body?.stato ?? "");
  if (!STATI.has(stato)) return erroreValidazione(res, "Stato non valido.");
  const r = db.prepare("UPDATE ordini SET stato = ? WHERE id = ?").run(stato, num(req.params.id, 0));
  if (r.changes === 0) return res.status(404).json({ errore: "Ordine non trovato." });
  res.json({ ok: true });
});

/* ---------- pulizia automatica degli ordini vecchi ----------
   Gli ordini contengono un nome: sono dati personali. Tenerli per sempre
   non serve a niente e aumenta il danno in caso di accesso non autorizzato,
   quindi si cancellano da soli dopo il periodo impostato.                */

function pulisciOrdini() {
  const giorni = num(impostazione("giorni_conservazione"), 30);
  const limite = new Date(Date.now() - giorni * 86_400_000);
  const r = db.prepare("DELETE FROM ordini WHERE ritiro_data < ?").run(aData(limite));
  if (r.changes) console.log(`Cancellati ${r.changes} ordini più vecchi di ${giorni} giorni.`);
  pulisciSessioni();
}
pulisciOrdini();
setInterval(pulisciOrdini, 6 * 3600_000).unref();

/* ---------- file statici ---------- */

app.use(express.static(path.join(qui, "..", "public"), {
  extensions: ["html"],
  maxAge: PRODUZIONE ? "1h" : 0
}));

app.use((req, res) => res.status(404).json({ errore: "Risorsa non trovata." }));

app.listen(PORTA, () => {
  console.log(`Container Serraglio in ascolto su http://localhost:${PORTA}`);
  console.log(`Pannello di gestione: http://localhost:${PORTA}/admin`);
});
