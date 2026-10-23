/* Popolamento del database con il menù del locale.
   Si esegue con: npm run seed            (PIN da ADMIN_PIN o 246810)
             o:   npm run seed -- --pin=482915
   Riscrive menù, orari e impostazioni. Non tocca un PIN già impostato e non
   cancella le chiusure straordinarie. */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { apriDb } from "./db.js";
import { creaHash } from "./auth.js";

const CATEGORIE = [
  { id: "schiacciate", nome: "Schiacciate", prezzo: 6, posizione: 1, nota: "Bevuta e caffè compresi" },
  { id: "pinsa", nome: "Pinse", prezzo: 7, posizione: 2, nota: "Bevuta e caffè compresi" },
  { id: "griglia", nome: "Hamburgher e hot dog", prezzo: 8, posizione: 3, nota: "Con patatine fritte, bevuta e caffè compresi" },
  { id: "primi", nome: "Primi piatti", prezzo: 8, posizione: 4, nota: "Bevuta e caffè compresi" }
];

/* Allergeni e ingredienti delle pinse: dati di ESEMPIO, da far verificare
   in cucina. Il pannello lo ricorda finché non viene spuntato
   "Allergeni verificati con la cucina". */
const PRODOTTI = [
  ["sc1", "schiacciate", "Container Serraglio 1", "Crudo, stracciatella, pomodori secchi, rucola", "glutine,latte", "p-crudo-stracciatella"],
  ["sc2", "schiacciate", "Container Serraglio 2", "Crudo, mozzarella, crema al tartufo", "glutine,latte", "p-crudo-tartufo"],
  ["al1", "schiacciate", "Almanacco 1", "Mortadella, pesto di pistacchio, pomodori secchi", "glutine,frutta_guscio", "p-grigliata"],
  ["al2", "schiacciate", "Almanacco 2", "Mortadella, stracciatella, crema di carciofi", "glutine,latte,frutta_guscio", "p-mortadella"],
  ["pg1", "schiacciate", "Playground 1", "Cotto, crema di carciofi, insalata", "glutine", "p-panino-cotto"],
  ["pg2", "schiacciate", "Playground 2", "Cotto, provola, zucchine", "glutine,latte", "p-zucchine"],
  ["bi1", "schiacciate", "Bischero 1", "Sbriciolona, provola, melanzane, insalata", "glutine,latte", "p-toast-cotto"],
  ["bi2", "schiacciate", "Bischero 2", "Sbriciolona, crema di carciofi, rucola", "glutine", "p-sbriciolona"],
  ["bis", "schiacciate", "Bisenzio", "Tonno, pomodoro, maionese, insalata", "glutine,uova,pesce", "p-tonno"],
  ["cot", "schiacciate", "Panino con cotoletta", "Cotoletta impanata", "glutine,uova,latte", "p-cotoletta"],
  ["pi1", "pinsa", "Margherita", "Pomodoro, mozzarella", "glutine,latte", "p-pinsa-margherita"],
  ["pi2", "pinsa", "Salamino piccante", "Pomodoro, mozzarella, salamino piccante", "glutine,latte", "p-pinsa-salamino"],
  ["pi3", "pinsa", "Cotto e wurstel", "Pomodoro, mozzarella, prosciutto cotto, wurstel", "glutine,latte", "p-pinsa-cotto"],
  ["pi4", "pinsa", "Napoli", "Pomodoro, mozzarella, acciughe", "glutine,latte,pesce", "p-pinsa-napoli"],
  ["pi5", "pinsa", "Crudo", "Pomodoro, mozzarella, prosciutto crudo", "glutine,latte", "p-pinsa-crudo"],
  ["hb", "griglia", "Hamburgher", "Con patatine fritte", "glutine,latte,sesamo", "p-hamburger"],
  ["hd", "griglia", "Hot dog", "Con patatine fritte", "glutine,senape", "p-hotdog"],
  ["pr1", "primi", "Primo del giorno", "Chiedi al banco la proposta di oggi", "glutine", "p-primo"]
];

/* lunedì-venerdì 10:00-15:00, sabato e domenica chiuso */
const ORARI = [0, 1, 2, 3, 4].map(g => [g, "10:00", "15:00"]).concat([[5, null, null], [6, null, null]]);

/* I dati legali restano vuoti: il sito mostra "dato da completare" finché
   il locale non li inserisce dal pannello. Niente valori inventati. */
const IMPOSTAZIONI = {
  nome_attivita: "Container Serraglio",
  telefono: "327 053 6624",
  whatsapp: "393270536624",
  indirizzo: "Via Jean Louise Protche 7/9, 59100 Prato",
  email: "almanaccoeventi@gmail.com",
  instagram: "https://www.instagram.com/containerserraglio/",
  facebook: "https://www.facebook.com/p/Container-Serraglio-61580715420443/",
  google_voto: "", google_recensioni: "", google_aggiornato: "", google_link: "",
  ragione_sociale: "", piva: "", codice_fiscale: "", rea: "", pec: "", titolare_trattamento: "",
  nota_prezzi: "Bevuta e caffè compresi in ogni menù.",
  anticipo_minimo: "15",
  passo_fascia: "10",
  ordini_attivi: "1",
  allergeni_verificati: "0",
  modalita_demo: "1"
};

export function semina(db, { pin }) {
  db.transaction(() => {
    db.prepare("DELETE FROM prodotti").run();
    db.prepare("DELETE FROM categorie").run();
    db.prepare("DELETE FROM orari").run();
    db.prepare("DELETE FROM impostazioni").run();

    const cat = db.prepare("INSERT INTO categorie (id, nome, nota, prezzo, posizione) VALUES (@id, @nome, @nota, @prezzo, @posizione)");
    CATEGORIE.forEach(c => cat.run(c));

    const pro = db.prepare(
      `INSERT INTO prodotti (id, categoria_id, nome, descrizione, allergeni, foto, prezzo, disponibile, posizione)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?)`);
    PRODOTTI.forEach(([id, cat, nome, descr, all, foto], i) => pro.run(id, cat, nome, descr, all, `img/${foto}.webp`, i));

    const ora = db.prepare("INSERT INTO orari (giorno, apertura, chiusura) VALUES (?, ?, ?)");
    ORARI.forEach(o => ora.run(...o));

    const imp = db.prepare("INSERT INTO impostazioni (chiave, valore, pubblica) VALUES (?, ?, 1)");
    Object.entries(IMPOSTAZIONI).forEach(([k, v]) => imp.run(k, v));

    if (!db.prepare("SELECT 1 FROM utenti WHERE nome = 'banco'").get()) {
      const { hash, sale } = creaHash(pin);
      db.prepare("INSERT INTO utenti (nome, hash, sale) VALUES ('banco', ?, ?)").run(hash, sale);
    }
  })();
}

/* ---------- uso da riga di comando ---------- */
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const argomento = process.argv.find(a => a.startsWith("--pin="));
  const pin = argomento ? argomento.slice(6) : (process.env.ADMIN_PIN || "246810");
  if (!/^\d{6}$/.test(pin)) {
    console.error("Il PIN deve essere di sei cifre.");
    process.exit(1);
  }
  const db = apriDb(process.env.DB_PATH || path.join(qui, "..", "dati", "container.db"));
  const nuovo = !db.prepare("SELECT 1 FROM utenti WHERE nome = 'banco'").get();
  semina(db, { pin });
  console.log(`Caricate ${CATEGORIE.length} categorie e ${PRODOTTI.length} prodotti.`);
  if (nuovo) console.log(`Utente "banco" creato con PIN ${pin}. Cambialo dal pannello prima di andare online.`);
}
