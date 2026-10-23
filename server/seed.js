/* Popolamento iniziale del database.
   Si esegue con: npm run seed
   Rilanciarlo NON cancella gli ordini: riscrive solo menù, orari e
   impostazioni, e non tocca il PIN già impostato. */

import { db, creaHash } from "./db.js";

const CATEGORIE = [
  { id: "schiacciate", nome: "Schiacciate", prezzo: 6.0, posizione: 1, nota: "" },
  { id: "pinsa", nome: "Pinsa", prezzo: 7.0, posizione: 2, nota: "" },
  { id: "griglia", nome: "Hamburgher e hot dog", prezzo: 8.0, posizione: 3, nota: "Patatine fritte comprese." },
  { id: "primi", nome: "Primi piatti", prezzo: 8.0, posizione: 4, nota: "" }
];

/* allergeni: dato di ESEMPIO, da far verificare in cucina */
const PRODOTTI = [
  ["sc1", "schiacciate", "Container Serraglio 1", "Crudo, stracciatella, pomodori secchi, rucola.", "glutine, latte", null],
  ["sc2", "schiacciate", "Container Serraglio 2", "Crudo, mozzarella, crema al tartufo.", "glutine, latte", null],
  ["al1", "schiacciate", "Almanacco 1", "Mortadella, pesto di pistacchio, pomodori secchi.", "glutine, frutta a guscio", "img/p-grigliata.webp"],
  ["al2", "schiacciate", "Almanacco 2", "Mortadella, stracciatella, crema di carciofi.", "glutine, latte, frutta a guscio", null],
  ["pg1", "schiacciate", "Playground 1", "Cotto, crema di carciofi, insalata.", "glutine", "img/p-panino-cotto.webp"],
  ["pg2", "schiacciate", "Playground 2", "Cotto, provola, zucchine.", "glutine, latte", null],
  ["bi1", "schiacciate", "Bischero 1", "Sbriciolona, provola, melanzane, insalata.", "glutine, latte", "img/p-toast-cotto.webp"],
  ["bi2", "schiacciate", "Bischero 2", "Sbriciolona, crema di carciofi, rucola.", "glutine", null],
  ["bis", "schiacciate", "Bisenzio", "Tonno, pomodoro, maionese, insalata.", "glutine, pesce, uova", null],
  ["cot", "schiacciate", "Panino con cotoletta", "", "glutine, uova, latte", null],
  ["pi1", "pinsa", "Margherita", "", "glutine, latte", null],
  ["pi2", "pinsa", "Salamino piccante", "", "glutine, latte", null],
  ["pi3", "pinsa", "Cotto e wurstel", "", "glutine, latte", "img/p-pinsa-cotto.webp"],
  ["pi4", "pinsa", "Napoli", "", "glutine, latte, pesce", null],
  ["pi5", "pinsa", "Crudo", "", "glutine, latte", null],
  ["hb",  "griglia", "Hamburgher", "Con patatine fritte.", "glutine, latte, sesamo", "img/p-hamburger.webp"],
  ["hd",  "griglia", "Hot dog", "Con patatine fritte.", "glutine, senape", "img/p-hotdog.webp"],
  ["pr1", "primi", "Primo piatto", "Chiedi al banco la proposta di oggi.", "glutine", null]
];

/* Lunedì-venerdì 10:00-15:00, sabato e domenica chiuso */
const ORARI = [0, 1, 2, 3, 4].map(g => [g, "10:00", "15:00"])
  .concat([[5, null, null], [6, null, null]]);

/* quanti pezzi arriva­no dal panificio: valori di esempio */
const SCORTE_OGGI = { schiacciate: 40, pinsa: 15, griglia: 20, primi: 12 };

const IMPOSTAZIONI = [
  ["nome_attivita", "Container Serraglio", 1],
  ["telefono", "327 053 6624", 1],
  ["whatsapp", "393270536624", 1],
  ["indirizzo", "Via Jean Louise Protche 7/9, 59100 Prato", 1],
  ["email", "almanaccoeventi@gmail.com", 1],
  ["instagram", "https://www.instagram.com/containerserraglio/", 1],
  ["facebook", "https://www.facebook.com/p/Container-Serraglio-61580715420443/", 1],
  // --- dati identificativi: VALORI DI ESEMPIO, da sostituire ---
  ["ragione_sociale", "Almanacco Associazione Culturale (dato di esempio)", 1],
  ["piva", "01234567890 (dato di esempio)", 1],
  ["codice_fiscale", "01234567890 (dato di esempio)", 1],
  ["pec", "esempio@pec.it (dato di esempio)", 1],
  ["titolare_trattamento", "Almanacco Associazione Culturale (dato di esempio)", 1],
  // --- parametri di servizio ---
  ["nota_prezzi", "Bevuta e caffè compresi in ogni menù. Prezzi della pausa pranzo.", 1],
  ["passo_fascia", "10", 1],
  ["anticipo_minimo", "15", 1],
  ["capienza_fascia", "6", 1],
  ["giorni_conservazione", "30", 1],
  ["ordini_attivi", "1", 1]
];

const inserisci = db.transaction(() => {
  db.prepare("DELETE FROM prodotti").run();
  db.prepare("DELETE FROM categorie").run();
  db.prepare("DELETE FROM orari").run();
  db.prepare("DELETE FROM impostazioni").run();

  const cat = db.prepare("INSERT INTO categorie (id, nome, nota, prezzo, posizione) VALUES (@id, @nome, @nota, @prezzo, @posizione)");
  CATEGORIE.forEach(c => cat.run(c));

  const pro = db.prepare(
    `INSERT INTO prodotti (id, categoria_id, nome, descrizione, allergeni, foto, prezzo, disponibile, posizione)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?)`
  );
  PRODOTTI.forEach((p, i) => pro.run(p[0], p[1], p[2], p[3], p[4], p[5], i));

  const ora = db.prepare("INSERT INTO orari (giorno, apertura, chiusura) VALUES (?, ?, ?)");
  ORARI.forEach(o => ora.run(...o));

  const imp = db.prepare("INSERT INTO impostazioni (chiave, valore, pubblica) VALUES (?, ?, ?)");
  IMPOSTAZIONI.forEach(i => imp.run(...i));

  const oggi = new Date().toLocaleDateString("sv-SE");
  const sc = db.prepare(
    `INSERT INTO scorte (ambito, riferimento, data, quantita) VALUES ('categoria', ?, ?, ?)
     ON CONFLICT(ambito, riferimento, data) DO UPDATE SET quantita = excluded.quantita`
  );
  Object.entries(SCORTE_OGGI).forEach(([c, n]) => sc.run(c, oggi, n));

  const esiste = db.prepare("SELECT 1 FROM utenti WHERE nome = 'banco'").get();
  if (!esiste) {
    const pin = process.env.ADMIN_PIN || "246810";
    const { hash, sale } = creaHash(pin);
    db.prepare("INSERT INTO utenti (nome, hash, sale) VALUES ('banco', ?, ?)").run(hash, sale);
    console.log(`Utente "banco" creato con PIN: ${pin} — cambialo al primo accesso.`);
  }
});

inserisci();
console.log(`Caricate ${CATEGORIE.length} categorie e ${PRODOTTI.length} prodotti.`);
