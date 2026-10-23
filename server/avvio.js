/* Controlli prima di mettersi in ascolto. Restituisce il motivo per cui
   non si deve partire, o null. Separati da server.js per poterli provare. */

const LOCALE = new Set(["127.0.0.1", "::1", "localhost"]);

export function controlliAvvio({ produzione, host, tunnel, baseUrl, pinPredefinito }) {
  if (produzione && !/^https:\/\/[^/]+$/.test(baseUrl || "")) {
    return "In produzione serve BASE_URL con https, es. BASE_URL=https://containerserraglio.it";
  }
  // il PIN 246810 è scritto nei vecchi documenti: va bene solo finché il sito è raggiungibile da questo computer
  const raggiungibile = produzione || tunnel || !LOCALE.has(host);
  if (pinPredefinito && raggiungibile) {
    return "Il pannello ha ancora il PIN predefinito e il sito è raggiungibile da altri. Cambialo: npm run seed -- --pin=NNNNNN --solo-pin";
  }
  return null;
}
