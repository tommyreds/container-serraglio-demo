import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rottePubbliche } from "./rotte/pubbliche.js";
import { rotteAdmin } from "./rotte/admin.js";
import { creaRender } from "./render.js";

const qui = path.dirname(fileURLToPath(import.meta.url));

/* Le pagine non caricano niente da fuori: font, immagini e script stanno
   tutti sul sito. Per questo la CSP può essere così stretta. */
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'",
  "form-action 'self'", "frame-ancestors 'none'"
].join("; ");

function intestazioni(req, res, next) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("X-Frame-Options", "DENY");
  next();
}

/* Ogni scrittura del pannello deve partire da una pagina di questo sito.
   SameSite=Strict sul cookie basta già quasi sempre; questo è il secondo
   lucchetto, utile anche con browser vecchi. */
function soloStessaOrigine(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD") return next();
  if (req.get("sec-fetch-site") === "same-origin") return next();
  const origine = req.get("origin");
  try {
    if (origine && new URL(origine).host === req.get("host")) return next();
  } catch { /* Origin non valido */ }
  res.status(403).json({ errore: "Richiesta non consentita." });
}

export function creaApp({
  db, now = () => new Date(), produzione = false,
  cartellaFoto, cartellaPublic = path.join(qui, "..", "public"), baseUrl = ""
}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);   // dietro Caddy: req.ip è quello del visitatore
  const render = creaRender({ db, now, cartellaPublic, cartellaFoto, baseUrl });
  app.locals.invalida = render.invalida;

  const contesto = { db, now, produzione, cartellaFoto, cartellaPublic, app, render, baseUrl };

  app.use(intestazioni);
  app.use("/api", (req, res, next) => { res.set("X-Robots-Tag", "noindex, nofollow"); next(); });
  app.use("/api/admin", soloStessaOrigine, rotteAdmin(contesto));
  app.use(rottePubbliche(contesto));
  app.use("/api", (req, res) => res.status(404).json({ errore: "Risorsa non trovata." }));
  app.use(express.static(cartellaPublic, {
    index: false,
    extensions: ["html"],   // /admin → admin.html
    setHeaders(res, _file) {
      res.setHeader("Cache-Control", res.req.query.v ? "public, max-age=31536000, immutable" : "no-cache");
    }
  }));
  app.use((req, res) => res.status(404).type("text/plain; charset=utf-8").send("Pagina non trovata."));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ errore: "Formato non valido." });
    if (err.type === "entity.too.large") return res.status(413).json({ errore: "Richiesta troppo grande." });
    console.error(err);
    res.status(500).json({ errore: "Errore del server. Riprova fra poco." });
  });
  return app;
}
