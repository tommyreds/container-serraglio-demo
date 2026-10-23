/* Container Serraglio — server della demo animata
   ------------------------------------------------------------------
   Serve solo i file di demo/public, senza database e senza dipendenze:
   basta Node. Le chiamate /api rispondono 404, quindi la pagina usa il
   menù DEMO scritto in app.js e prepara l'ordine per WhatsApp invece di
   registrarlo. Le intestazioni di sicurezza sono le stesse di
   server/server.js, così la demo prova anche che la CSP regge.
   ------------------------------------------------------------------ */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const radice = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const PORTA = Number(process.env.PORTA_DEMO) || 3001;
const TIPI = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp"
};

http.createServer((req, res) => {
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

  let percorso;
  try { percorso = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.statusCode = 400; return res.end(); }
  const file = path.join(radice, percorso === "/" ? "index.html" : percorso);

  if (!file.startsWith(radice + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ errore: "Risorsa non trovata." }));
  }
  res.setHeader("Content-Type", TIPI[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(PORTA, () => {
  console.log(`Demo animata su http://localhost:${PORTA}`);
  console.log(`Con "riduci movimento" attivo nel sistema: http://localhost:${PORTA}/?movimento`);
});
