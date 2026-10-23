/* Orari del locale, sempre nel fuso di Roma.
   Funzioni pure, usate uguali dal server e dal browser: il server di
   produzione gira in UTC, il telefono dello studente nel suo fuso, ma
   "oggi", "aperto" e gli orari di ritiro devono essere quelli di Prato.
   Tutte ricevono l'istante come parametro, così i test possono fissarlo. */

const FORMATO = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23"
});
const SETTIMANA = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const NOMI_GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const GIORNI_AVANTI = 14;

const aMinuti = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const aOra = n => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/* Data (AAAA-MM-GG), minuti dalla mezzanotte e giorno (0 = lunedì) a Roma. */
export function oraRoma(now) {
  const p = Object.fromEntries(FORMATO.formatToParts(now).map(x => [x.type, x.value]));
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    minuti: Number(p.hour) * 60 + Number(p.minute),
    giorno: SETTIMANA[p.weekday]
  };
}

/* Aritmetica sulle date di calendario: niente fusi, solo il giorno. */
export function aggiungiGiorni(data, n) {
  const [a, m, g] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g + n)).toISOString().slice(0, 10);
}

const orarioDel = (orari, giorno) => {
  const o = orari.find(x => x.giorno === giorno);
  return o && o.apertura && o.chiusura ? o : null;
};

export function statoApertura({ orari, chiusure, now }) {
  const qui = oraRoma(now);
  const chiusoOggi = chiusure.includes(qui.data);
  const oggi = chiusoOggi ? null : orarioDel(orari, qui.giorno);
  const aperto = !!oggi && qui.minuti >= aMinuti(oggi.apertura) && qui.minuti < aMinuti(oggi.chiusura);

  let riapre = null;
  if (!aperto) {
    for (let salto = 0; salto <= GIORNI_AVANTI && !riapre; salto++) {
      const data = aggiungiGiorni(qui.data, salto);
      const giorno = (qui.giorno + salto) % 7;
      const o = chiusure.includes(data) ? null : orarioDel(orari, giorno);
      if (!o || (salto === 0 && qui.minuti >= aMinuti(o.apertura))) continue;
      const quando = salto === 0 ? "oggi" : salto === 1 ? "domani" : NOMI_GIORNI[giorno];
      riapre = { data, ora: o.apertura, etichetta: `${quando} alle ${o.apertura}` };
    }
  }
  return { aperto, chiusoOggi, chiudeAlle: aperto ? oggi.chiusura : null, riapre };
}

/* Orari di ritiro proposti per oggi: dal primo multiplo di "passo" dopo
   l'anticipo minimo fino a un "passo" prima della chiusura. */
export function orariRitiro({ orari, chiusure, now, anticipo = 15, passo = 10 }) {
  const qui = oraRoma(now);
  const o = chiusure.includes(qui.data) ? null : orarioDel(orari, qui.giorno);
  if (!o) return [];
  const primo = Math.ceil(Math.max(qui.minuti + anticipo, aMinuti(o.apertura)) / passo) * passo;
  const fasce = [];
  for (let t = primo; t <= aMinuti(o.chiusura) - passo; t += passo) fasce.push(aOra(t));
  return fasce;
}

export function testoStato(stato) {
  if (stato.aperto) return `Aperto · fino alle ${stato.chiudeAlle}`;
  const inizio = stato.chiusoOggi ? "Chiuso oggi" : "Chiuso";
  return stato.riapre ? `${inizio} · riapre ${stato.riapre.etichetta}` : inizio;
}
