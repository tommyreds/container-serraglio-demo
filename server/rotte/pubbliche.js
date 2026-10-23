import express from "express";
import path from "node:path";
import zlib from "node:zlib";
import { leggiMenu, leggiOrari, leggiChiusure, leggiImpostazioni } from "../db.js";
import { NOME_VALIDO, TIPI_MIME } from "../foto.js";
import { oraRoma } from "../../public/lib/orari.js";
import { paginaLegale, NOMI_PAGINE, robotsTxt, sitemapXml } from "../legale.js";
import { asset } from "../render.js";

export function rottePubbliche({ db, now, cartellaFoto, cartellaPublic, render, baseUrl }) {
  const r = express.Router();

  /* La pagina si comprime qui (circa 60 KB → 12 KB): in produzione Caddy
     lascia stare ciò che è già compresso, e senza Caddy (tunnel, telefono)
     la pagina arriva comunque leggera. */
  r.get("/", (req, res) => {
    const html = render.pagina();
    res.set({ "Cache-Control": "no-cache", Vary: "Accept-Encoding" }).type("html");
    if (req.acceptsEncodings("gzip") === "gzip") {
      return res.set("Content-Encoding", "gzip").send(zlib.gzipSync(html, { level: 6 }));
    }
    res.send(html);
  });

  /* Pagine legali: composte a ogni richiesta dai dati del pannello (sono
     poche e leggere, e così non restano mai indietro). */
  const origine = req => baseUrl || `${req.protocol}://${req.get("host")}`;
  for (const nome of NOMI_PAGINE) {
    r.get(`/${nome}`, (req, res) => {
      const oggi = oraRoma(now()).data;
      res.set("Cache-Control", "no-cache").type("html").send(paginaLegale(nome, {
        impostazioni: leggiImpostazioni(db), menu: leggiMenu(db, { oggi }), oggi
      }, { asset, baseUrl }));
    });
  }
  r.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(robotsTxt(leggiImpostazioni(db).modalita_demo === "1", origine(req)));
  });
  r.get("/sitemap.xml", (req, res) => res.type("application/xml").send(sitemapXml(origine(req))));

  // esplicita: public/admin/ è anche una cartella (i moduli del pannello)
  r.get("/admin", (req, res) => {
    res.set({ "Cache-Control": "no-cache", "X-Robots-Tag": "noindex, nofollow" }).sendFile("admin.html", { root: path.resolve(cartellaPublic) });
  });

  r.get("/salute", (req, res) => {
    db.prepare("SELECT 1").get();
    res.set("Cache-Control", "no-store").json({ ok: true });
  });

  /* Menù in JSON: il browser lo rilegge quando si apre il vassoio, per
     accorgersi di un prodotto finito nel frattempo. */
  r.get("/api/menu", (req, res) => {
    const oggi = oraRoma(now()).data;
    res.set("Cache-Control", "no-cache").json({
      oggi,
      categorie: leggiMenu(db, { oggi }),
      orari: leggiOrari(db),
      chiusure: leggiChiusure(db, oggi),
      impostazioni: leggiImpostazioni(db)
    });
  });

  /* Foto caricate dal pannello: solo nomi generati dal server, tipo fisso
     dall'estensione, cache lunga perché a ogni nuova foto cambia il nome. */
  r.get("/foto/:nome", (req, res) => {
    const nome = req.params.nome;
    if (!NOME_VALIDO.test(nome)) return res.status(404).type("text/plain").send("Foto non trovata.");
    // root assoluta: funziona anche con FOTO_DIR relativo o dentro cartelle che iniziano con "."
    res.sendFile(nome, {
      root: path.resolve(cartellaFoto),
      headers: {
        "Content-Type": TIPI_MIME[nome.split(".").pop()],
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    }, err => { if (err && !res.headersSent) res.status(404).type("text/plain").send("Foto non trovata."); });
  });

  return r;
}
