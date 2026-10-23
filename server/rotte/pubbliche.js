import express from "express";
import path from "node:path";
import { leggiMenu, leggiOrari, leggiChiusure, leggiImpostazioni } from "../db.js";
import { NOME_VALIDO, TIPI_MIME } from "../foto.js";
import { oraRoma } from "../../public/lib/orari.js";

export function rottePubbliche({ db, now, cartellaFoto, render }) {
  const r = express.Router();

  r.get("/", (req, res) => {
    res.set("Cache-Control", "no-cache").type("html").send(render.pagina());
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
